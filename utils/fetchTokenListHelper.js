const axios = require('axios');
const Response = require("../classes/Response");
const db = require("../config/db.config");
const { isContractAddress } = require("./checkContractAddress");
const convertDexDataToCustomFormat = require("./convertDexDataToProperFormat");

// Create axios instance with keep-alive configuration
const axiosInstance = axios.create({
    timeout: 3000,
    headers: {
      'Accept-Encoding': 'gzip, deflate, br',
    },
    httpAgent: new (require('http').Agent)({
      keepAlive: true,
      keepAliveMsecs: 3000,
      maxSockets: 50,
      maxFreeSockets: 10,
      timeout: 60000,
      freeSocketTimeout: 30000,
    }),
    httpsAgent: new (require('https').Agent)({
      keepAlive: true,
      keepAliveMsecs: 3000,
      maxSockets: 50,
      maxFreeSockets: 10,
      timeout: 60000,
      freeSocketTimeout: 30000,
    }),
  });

const handleWalletAndSearch = async (req, res) => {
    const { search, wallet_address } = req.query;
    let tokens = await getTokensBySearch(search);
  
    const balances = await getTokensWithBalanceFromGlacier(wallet_address);
    const enriched = mergeBalancesWithTokens(tokens, balances);
  
    return res.status(200).send(Response.sendResponse(true, enriched, null, 200));
  };

  const handleWalletOnly = async (req, res) => {
    const { wallet_address } = req.query;
  
    const balances = await getTokensWithBalanceFromGlacier(wallet_address);
    if (balances.length === 0) {
      return res.status(200).send(Response.sendResponse(true, [], null, 200));
    }
  
    const enriched = await getTokensByWallet(balances);
    return res.status(200).send(Response.sendResponse(true, enriched, null, 200));
  };

  
  const handleSearchOnly = async (req, res) => {
    let { search } = req.query;
    if (!search) search = 'l';
  
    const tokens = await getTokensBySearch(search);

    console.log(search)
    return res.status(200).send(Response.sendResponse(true, tokens, null, 200));
  };

  
  const getTokensBySearch = async (search) => {
    const isContract = await isContractAddress(search);
    console.log("is", isContract)
    if (isContract) {
      const tokenMeta = await getTokenByContract(search);
      console.log("token", tokenMeta)
      if (!tokenMeta) return [];
      
      return tokenMeta.lp_deployed
        ? convertDexDataToCustomFormat(await fetchDexScreenerData(search))
        : await getDbTokensWithTrades(search);
    }
  
    if (search.length <= 2) {
      return convertDexDataToCustomFormat(await fetchDexScreenerData(search));
    }
  
    const tokens = await db.sequelize.query(
      `SELECT lp_deployed FROM "arena-trade-coins" WHERE name ILIKE :search OR symbol ILIKE :search ORDER BY lp_deployed DESC LIMIT 3`,
      {
        replacements: { search: `${search}%` },
        type: db.Sequelize.QueryTypes.SELECT,
      }
    );
  
    if (tokens.length === 0) return [];
  
    const deployed = tokens.filter(t => t.lp_deployed === true).length;
    const notDeployed = tokens.length - deployed;
  
    if (deployed > notDeployed) {
      return convertDexDataToCustomFormat(await fetchDexScreenerData(search));
    }
  
    return await getDbTokensWithTrades(search);
  };
  

  const getTokenByContract = async (contract_address) => {
    const [token] = await db.sequelize.query(
      `SELECT lp_deployed FROM "arena-trade-coins" WHERE LOWER(contract_address) = LOWER(:contract_address)`,
      {
        replacements: { contract_address },
        type: db.Sequelize.QueryTypes.SELECT,
      }
    );
    return token;
  };

  
  const getDbTokensWithTrades = async (search) => {
    let res =  await db.sequelize.query(
      `SELECT 
          c.internal_id, c.name, c.symbol, c.lp_deployed, c.pair_address, c.contract_address,
          (t.price_after_usd * 10000000000) AS marketCap, tm.photo_url
       FROM "arena-trade-coins" c
       LEFT JOIN (
           SELECT DISTINCT ON (token_id) token_id, price_after_usd, timestamp
           FROM arena_trades
           WHERE status = 'success' 
           ORDER BY token_id, timestamp DESC
       ) t ON c.internal_id = t.token_id
       INNER JOIN token_metadata tm ON c.contract_address = tm.contract_address
       WHERE LOWER(c.contract_address) = LOWER(:search) OR c.name ILIKE :search OR c.symbol ILIKE :search
       ORDER BY marketCap ASC
       LIMIT 5`,
      {
        replacements: { search: `${search}%` },
        type: db.Sequelize.QueryTypes.SELECT,
      }
    );
    console.log("res", res)
    return res;
  };

  
  const getTokensWithBalanceFromGlacier = async (wallet_address) => {
    const { data } = await axiosInstance.get(
      `https://glacier-api.avax.network/v1/chains/43114/addresses/${wallet_address}/balances:listErc20`,
      {
        params: { pageSize: 200, filterSpamTokens: true, currency: 'usd' },
        headers: { accept: 'application/json' },
      }
    );
  
    return data.erc20TokenBalances.filter(t => t.balance && BigInt(t.balance) > 1n);
  };

  
  const mergeBalancesWithTokens = (tokens, balances) => {
    const balanceMap = Object.fromEntries(
      balances.map(b => [b.address.toLowerCase(), parseFloat(b.balance) / 10 ** 18])
    );
  
    return tokens.map(token => ({
      ...token,
      balance: balanceMap[token.contract_address?.toLowerCase()] || 0
    }));
  };

  const getTokensByWallet = async (balances) => {
    const tokenAddresses = balances.map(t => t.address.toLowerCase());
  
    const dbTokens = await db.sequelize.query(
      `SELECT name, symbol, contract_address, lp_deployed, pair_address
       FROM "arena-trade-coins"
       WHERE LOWER(contract_address) IN (:addresses)`,
      {
        replacements: { addresses: tokenAddresses },
        type: db.Sequelize.QueryTypes.SELECT,
      }
    );
  
    const lpTokens = dbTokens.filter(t => t.lp_deployed);
    const nonLpTokens = dbTokens.filter(t => !t.lp_deployed);
  
    let results = [];
  
    if (lpTokens.length > 0) {
      const joined = lpTokens.map(t => t.contract_address).join(',');
      const dexData = await fetchDexScreenerData(joined);
      results.push(...convertDexDataToCustomFormat(dexData));
    }
  
    if (nonLpTokens.length > 0) {
      const lowerCaseList = nonLpTokens.map(t => t.contract_address.toLowerCase());
      const dbData = await getDbTokensWithTradesByContractList(lowerCaseList);
      results.push(...dbData);
    }
  
    return mergeBalancesWithTokens(results, balances);
  };

  const getDbTokensWithTradesByContractList = async (contractList) => {
    return db.sequelize.query(
      `SELECT 
          c.internal_id, c.name, c.symbol, c.lp_deployed, c.pair_address, c.contract_address,
          (t.price_after_usd * 10000000000) AS marketCap, tm.photo_url
       FROM "arena-trade-coins" c
       LEFT JOIN (
           SELECT DISTINCT ON (token_id) token_id, price_after_usd, timestamp
           FROM arena_trades
           WHERE status = 'success'
           ORDER BY token_id, timestamp DESC
       ) t ON c.internal_id = t.token_id
       LEFT JOIN token_metadata tm ON c.contract_address = tm.contract_address
       WHERE LOWER(c.contract_address) IN (:contract_addresses)
       LIMIT 5`,
      {
        replacements: { contract_addresses: contractList },
        type: db.Sequelize.QueryTypes.SELECT,
      }
    );
  };
  

  // Helper function to fetch DexScreener data
const fetchDexScreenerData = async (search) => {
    const url = `https://api.dexscreener.com/latest/dex/search?q=AVAX/${search}`;
    const response = await axiosInstance.get(url);
    // Filter pairs by chainId - avalanche
    const avalanchePairs = response.data.pairs.filter(pair => pair.dexId === "arenatrade");
    return avalanchePairs;
  };

module.exports = {
  handleWalletAndSearch,
  handleWalletOnly,
  handleSearchOnly,
  getTokensBySearch,
  getTokenByContract,
  getDbTokensWithTrades,
  getTokensWithBalanceFromGlacier,
  mergeBalancesWithTokens,
  getTokensByWallet,
  getDbTokensWithTradesByContractList,
  fetchDexScreenerData
};