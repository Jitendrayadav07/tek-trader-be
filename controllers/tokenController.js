const axios = require('axios');

// Create axios instance with keep-alive configuration
const axiosInstance = axios.create({
  timeout: 5000,
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
const Response = require("../classes/Response");
const db = require("../config/db.config");
const DexScreenerService = require('../classes/pairAddress');
const { ethers } = require("ethers");
const { Op, QueryTypes, where } = require("sequelize");
const Web3 = require("web3");
const web3 = new Web3();
const fetchStarsArenaCommunities = require("../utils/starsArenaApi")
const formatCommunityData = require("../utils/communityUtils.js")
const StarsArenaTopCommunities = require("../utils/StarsArenaTopCommunities.js.js");
const convertDexDataToCustomFormat = require('../utils/convertDexDataToProperFormat.js');
const { isContractAddress } = require('../utils/checkContractAddress.js');
const redisClient = require('../utils/redisClient.js');
const provider = new ethers.JsonRpcProvider("https://api.avax.network/ext/bc/C/rpc");


const ERC20_ABI = [
  "function balanceOf(address) view returns (uint256)",
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)",
  "event Transfer(address indexed from, address indexed to, uint256 value)",
  "function balanceOf(address account) view returns (uint256)",
  "function totalSupply() view returns (uint256)",
  "function decimals() view returns (uint8)"
];

const recentTokens = async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 10;
    const offset = parseInt(req.query.offset) || 0;
    const search = req.query.search || "";

    const whereCondition = search
      ? {
        [Op.or]: [
          { name: { [Op.iLike]: `%${search}%` } },
          { symbol: { [Op.iLike]: `%${search}%` } },
          { contract_address: { [Op.iLike]: `%${search}%` } },
          { pair_address: { [Op.iLike]: `%${search}%` } },
        ],
      }
      : {};


    const tokens = await db.ArenaTradeCoins.findAll({
      where: whereCondition,
      order: [["internal_id", "DESC"]],
      limit,
      offset,
    });

    const tokenIds = tokens.map((t) => t.internal_id);

    const trades = await db.ArenaTrade.findAll({
      where: {
        token_id: {
          [Op.in]: tokenIds,
        },
      },
    });

    const tradeMap = {};
    for (const trade of trades) {
      const tid = trade.token_id;
      if (!tradeMap[tid]) tradeMap[tid] = [];
      tradeMap[tid].push(trade);
    }

    const latestPriceRes = await db.sequelize.query(
      `SELECT price FROM avax_price_live ORDER BY fetched_at DESC LIMIT 1`,
      { type: db.Sequelize.QueryTypes.SELECT }
    );

    if (!latestPriceRes.length) {
      throw new Error("AVAX price not found in avax_price_live table");
    }

    const avax_price = parseFloat(latestPriceRes[0].price);

    const responseList = await Promise.all(
      tokens.map(async (token) => {
        const tokenTrades = tradeMap[token.internal_id] || [];

        // 🟩 Calculate latest trade by absolute_tx_position
        tokenTrades.sort((a, b) => {
          const aPos = BigInt(a.absolute_tx_position || 0);
          const bPos = BigInt(b.absolute_tx_position || 0);
          return aPos > bPos ? 1 : aPos < bPos ? -1 : 0;
        });

        const latestTrade = tokenTrades[tokenTrades.length - 1] || null;
        const latest_trade_absolute_order = latestTrade?.absolute_tx_position || null;

        const latest_price_eth = latestTrade?.price_after_eth
          ? parseFloat(latestTrade.price_after_eth)
          : 0;

        const latest_price_usd = latest_price_eth * avax_price;

        // 🟩 Sum of transferred AVAX
        const latest_total_volume_eth = tokenTrades.reduce(
          (sum, t) => sum + parseFloat(t.transferred_avax || 0),
          0
        );

        const latest_total_volume_usd = latest_total_volume_eth * avax_price;

        const latest_transaction_count = tokenTrades.length;

        const latest_holder_count = new Set(
          tokenTrades.map((t) => t.from_address)
        ).size;

        const tokens_by_creator = await db.ArenaTradeCoins.count({
          where: { creator_address: token.creator_address },
        });

        // 🟩 Calculate latest_supply_eth using BigInt
        const initialBuyAmount = tokenTrades
          .filter((t) => t.action === "initial buy")
          .reduce((sum, t) => sum + BigInt(t.amount || "0"), 0n);

        const totalBuyAmount = tokenTrades
          .filter((t) => t.action === "buy")
          .reduce((sum, t) => sum + BigInt(t.amount || "0"), 0n);

        const totalSellAmount = tokenTrades
          .filter((t) => t.action === "sell")
          .reduce((sum, t) => sum + BigInt(t.amount || "0"), 0n);

        const latest_supply_wei = initialBuyAmount + totalBuyAmount - totalSellAmount;
        const latest_supply_eth = Number(latest_supply_wei) / 1e18;

        const tokenMetadata = await db.TokenMetadata.findOne({
          where: { bc_group_id: token.internal_id },
        });

        return {
          row_id: token.id,
          tokens: tokens.ip_deployed,
          creator_address: token.creator_address?.toLowerCase(),
          contract_address: process.env.CONTRACT_ADDRESS,
          token_id: token.internal_id.toString(),
          total_supply_eth: parseFloat(token.supply) / 1e18,
          token_name: token.name,
          token_symbol: token.symbol,
          a: token.a,
          b: token.b,
          curve_scaler: Number(token.curve_scaler),
          lp_deployed: token.lp_deployed,
          lp_percentage: Number(token.lp_percentage) / 100,
          sale_percentage: Number(token.sale_percentage) / 100,
          pair_address: token.pair_address?.toLowerCase(),
          token_contract_address: token.contract_address?.toLowerCase(),
          create_time: Math.floor(
            new Date(token.system_created).getTime() / 1000
          ),
          transaction_hash: token.create_token_tx_id,
          migration_time: null,
          migration_transaction_hash: null,
          photo_url: tokenMetadata?.photo_url || null,
          description: tokenMetadata?.description || " ",
          creator_twitter_handle: tokenMetadata?.owner_twitter_handle === 'burakarenqa' ? null : tokenMetadata?.owner_twitter_handle,
          creator_twitter_pfp_url: tokenMetadata?.owner_twitter_picture === 'https://static.starsarena.com/uploads/387d6390-ae77-1a15-ae42-142afaf024e61732639334845.png' ? null : tokenMetadata?.owner_twitter_picture,
          creator_twitter_followers: tokenMetadata?.owner_twitter_followers || null,
          latest_trade_absolute_order: Number(latest_trade_absolute_order),
          latest_price_eth: Number(latest_price_eth.toFixed(12)),
          latest_avax_price: Number(avax_price.toFixed(12)),
          latest_price_usd: Number(latest_price_usd.toFixed(12)),
          latest_total_volume_eth: Number(latest_total_volume_eth.toFixed(6)),
          latest_total_volume_usd: Number(latest_total_volume_usd.toFixed(6)),
          latest_transaction_count,
          latest_holder_count,
          latest_supply_eth: Number(latest_supply_eth.toFixed(6)),
          tokens_by_creator,
          dexscreener_image_url: null,
          dexscreener_header: null,
          dexscreener_open_graph: null,
          dexscreener_website: null,
          dexscreener_social: null,
          dexscreener_last_updated: null,
        };
      })
    );

    return res.status(200).send(
      Response.sendResponse(true, { offset, limit, items: responseList }, null, 200)
    );
  } catch (err) {
    console.error("Error in recentTokens:", err);
    return res
      .status(500)
      .send(Response.sendResponse(false, null, "Error occurred", 500));
  }
};

const pairTokenData = async (req, res) => {
  try {
    const { pairId } = req.params;
    const url = `https://api.dexscreener.com/latest/dex/pairs/avalanche/${pairId}`;

    const response = await axios.get(url);
    return res.status(200).send(Response.sendResponse(true, response.data.pair, null, 200));
  } catch (err) {
    return res.status(500).send(Response.sendResponse(false, null, "Error occurred", 500));
  }
}

const pairTokenDataNew = async (req, res) => {
  try {
    const { pairId } = req.params;
    if (!pairId) {
      return res
        .status(400)
        .send(Response.sendResponse(false, null, "Pair address is required", 400));
    }

    // Query your DB
    const pairData = await db.sequelize.query(
      `SELECT atc.contract_address, atc.symbol, atc.name, atc.pair_address,  atc.lp_deployed, atc.creator_address, atc.internal_id, atc.supply ,atc.system_created
       FROM "arena-trade-coins" AS atc 
       WHERE LOWER(atc.pair_address) = LOWER(:pair_address)`,
      {
        replacements: { pair_address: pairId },
        type: db.Sequelize.QueryTypes.SELECT,
      }
    );

    if (!pairData || pairData.length === 0) {
      return res
        .status(404)
        .send(Response.sendResponse(false, null, "Pair not found", 404));
    }

    const token = pairData[0];

    const token_data = await db.sequelize.query(
      `SELECT atc.pair_address, atc.contract_address, atc.supply, at.token_id, atc.internal_id, atc.lp_deployed,
              at.action, at.from_address, at.amount, atc.name, at.timestamp, at.status
       FROM "arena_trades" AS at 
       LEFT JOIN "arena-trade-coins" AS atc ON at.token_id = atc.internal_id 
       WHERE LOWER(atc.pair_address) = LOWER(:pair_address)`,
      {
        replacements: { pair_address: token.pair_address },
        type: db.Sequelize.QueryTypes.SELECT,
      }
    );
    let token_type = "prebonded"
    // ✅ Calculate txns for m5, h1, h6, h24
    const now = new Date();

    const timeframes = {
      m5: 5 * 60 * 1000,        // 5 min in ms
      h1: 60 * 60 * 1000,       // 1 hr in ms
      h6: 6 * 60 * 60 * 1000,   // 6 hr in ms
      h24: 24 * 60 * 60 * 1000, // 24 hr in ms
    };

    const txns = {
      m5: { buys: 0, sells: 0 },
      h1: { buys: 0, sells: 0 },
      h6: { buys: 0, sells: 0 },
      h24: { buys: 0, sells: 0 },
    };

    token_data.forEach(txn => {
      const txnTime = new Date(txn.timestamp);
      const diff = now - txnTime; // difference in ms

      for (const [key, window] of Object.entries(timeframes)) {
        if (diff <= window) {
          if (
            txn.action.toLowerCase() === 'buy' ||
            txn.action.toLowerCase() === 'initial buy'
          ) {
            txns[key].buys += 1;
          } else if (txn.action.toLowerCase() === 'sell') {
            txns[key].sells += 1;
          }
        }
      }
    });

    const baseToken = {
      address: token.contract_address,
      name: token.name,
      symbol: token.symbol,
    };


    const participants = calculateParticipantsByTimeframe(token_data, timeframes, now);

    const quoteToken = {
      address: "0xB31f66AA3C1e785363F0875A1B74E27b85FD66c7",
      name: "Wrapped AVAX",
      symbol: "WAVAX",
    };

    const result = {
      token: token_type,
      lp_deployed: token.lp_deployed,
      chainId: "avalanche",
      dexId: "arenatrade",
      url: `https://dexscreener.com/avalanche/${token.pair_address}`,
      pairAddress: token.pair_address,
      baseToken,
      quoteToken,
      priceNative: "0",
      priceUsd: "0",
      txns, // ✅ here’s your live counts
      participants,
      volume: {
        m5: 0,
        h1: 0,
        h6: 0,
        h24: 0,
      },
      priceChange: {
        h1: 0,
        h6: 0,
        h24: 0,
      },
      liquidity: {
        usd: 0,
        base: 0,
        quote: 0,
      },
      fdv: 0,
      marketCap: 0,
      pairCreatedAt: token.system_created,
      buyers: 0,
      sellers: 0,
      makers: 0,
      info: {
        imageUrl: "",
        header: "",
        openGraph: "",
        websites: [],
        socials: [],
      },
    };

    return res
      .status(200)
      .send({ isSuccess: true, result, message: null, statusCode: 200 });

  } catch (err) {
    console.error(err);
    return res
      .status(500)
      .send(Response.sendResponse(false, null, "Error occurred", 500));
  }
};

function calculateParticipantsByTimeframe(token_data, timeframes, now) {
  const buyersByTimeframe = {
    m5: new Set(),
    h1: new Set(),
    h6: new Set(),
    h24: new Set(),
  };

  const sellersByTimeframe = {
    m5: new Set(),
    h1: new Set(),
    h6: new Set(),
    h24: new Set(),
  };

  token_data.forEach(txn => {
    const txnTime = new Date(txn.timestamp);
    const diff = now - txnTime;
    const addr = txn.from_address.toLowerCase();
    const action = txn.action.toLowerCase();

    for (const [key, window] of Object.entries(timeframes)) {
      if (diff <= window) {
        if (action === 'buy' || action === 'initial buy') {
          buyersByTimeframe[key].add(addr);
        } else if (action === 'sell') {
          sellersByTimeframe[key].add(addr);
        }
      }
    }
  });

  return {
    m5: {
      buyers: buyersByTimeframe.m5.size,
      sellers: sellersByTimeframe.m5.size,
      makers: buyersByTimeframe.m5.size + sellersByTimeframe.m5.size

    },
    h1: {
      buyers: buyersByTimeframe.h1.size,
      sellers: sellersByTimeframe.h1.size,
      makers: buyersByTimeframe.h1.size + sellersByTimeframe.h1.size
    },
    h6: {
      buyers: buyersByTimeframe.h6.size,
      sellers: sellersByTimeframe.h6.size,
      makers: buyersByTimeframe.h6.size + sellersByTimeframe.h6.size,
    },
    h24: {
      buyers: buyersByTimeframe.h24.size,
      sellers: sellersByTimeframe.h24.size,
      makers: buyersByTimeframe.h24.size + sellersByTimeframe.h24.size,
    },
  };
}

// Helper function to fetch DexScreener data
const fetchDexScreenerData = async (search) => {
  let url = `https://api.dexscreener.com/latest/dex/search?q=AVAX/ARENATRADE`;
  if(search) 
    url = url + `/${search}`

  const response = await axiosInstance.get(url);
  return response.data.pairs;
};

const tokenListTokens = async (req, res) => {
  try {
    let { search, wallet_address } = req.query;
    if (wallet_address && search) {
      let formattedResponse;

      let _isContractAddress = await isContractAddress(search)

      if(_isContractAddress) {
              // Find token by contract address from arena-trade-coins
      const tokenByContract = await db.sequelize.query(
        `SELECT lp_deployed FROM "arena-trade-coins" WHERE LOWER(contract_address) = LOWER(:contract_address)`,
        {
          replacements: { contract_address: search },
          type: db.Sequelize.QueryTypes.SELECT,
        }
      );

      console.log("token", tokenByContract)

        if (tokenByContract.length > 0) {
          const token = tokenByContract[0];
          
          // If lp_deployed is true, call DexScreener API
          if (token.lp_deployed == true) {  
            const avalanchePairs = await fetchDexScreenerData(search);
            formattedResponse = convertDexDataToCustomFormat(avalanchePairs);
            // return res.status(200).send(Response.sendResponse(true, [formattedResponse[0]], null, 200));
          } else {
            // Return the token data from database
            const dbTokensWithTrades = await db.sequelize.query(
              `SELECT 
                  c.internal_id,
                  c.name,
                  c.symbol,
                  c.lp_deployed,
                  c.pair_address,
                  c.contract_address,
                  (t.price_after_usd * 10000000000) AS marketCap,
                  tm.photo_url
                  FROM "arena-trade-coins" c
                  LEFT JOIN (
                      SELECT DISTINCT ON (token_id) 
                          token_id,
                          price_after_usd,
                          timestamp
                      FROM arena_trades
                      WHERE status = 'success'
                      ORDER BY token_id, timestamp DESC
                  ) t
                  ON c.internal_id = t.token_id
                  LEFT JOIN token_metadata tm
                  ON c.contract_address = tm.contract_address
                    WHERE LOWER(c.contract_address) = LOWER(:contract_address)
                  LIMIT 5;`,
                {
                  replacements: { contract_address: `${search}` },
                  type: db.Sequelize.QueryTypes.SELECT,
                }
            );
            formattedResponse = dbTokensWithTrades
            //return res.status(200).send(Response.sendResponse(true, dbTokensWithTrades, null, 200));
          }
        }
      }
      else{ 
        if(search.length <= 2) {
          const avalanchePairs = await fetchDexScreenerData(search);
          formattedResponse = convertDexDataToCustomFormat(avalanchePairs);
          // return res.status(200).send(Response.sendResponse(true, formattedResponse, null, 200));
        }
        else {
            // Query arena-trade-coins table for tokens matching the search
            const dbTokens = await db.sequelize.query(
              `SELECT lp_deployed FROM "arena-trade-coins" WHERE name ILIKE :search OR symbol ILIKE :search ORDER BY lp_deployed DESC LIMIT 3`,
              {
                replacements: { search: `${search}%` },
                type: db.Sequelize.QueryTypes.SELECT,
              }
            );
      
            // Check if majority of tokens have lp_deployed as true or false
            if (dbTokens.length > 0) {
              const deployedCount = dbTokens.filter(token => token.lp_deployed === true).length;
              const notDeployedCount = dbTokens.filter(token => token.lp_deployed === false).length;
              
              if (deployedCount > notDeployedCount) {
                const avalanchePairs = await fetchDexScreenerData(search);
                formattedResponse = convertDexDataToCustomFormat(avalanchePairs);
                // return res.status(200).send(Response.sendResponse(true, formattedResponse, null, 200));
              } else {
                console.log("Equal number of deployed and non-deployed tokens");
                
                // Query arena-trade-coins table with join from arena_trades
                formattedResponse = await db.sequelize.query(
                  `SELECT 
                      c.internal_id,
                      c.name,
                      c.symbol,
                      c.lp_deployed,
                      c.pair_address,
                      c.contract_address,
                      (t.price_after_usd * 10000000000) AS marketCap,
                      tm.photo_url
                  FROM "arena-trade-coins" c
                  LEFT JOIN (
                      SELECT DISTINCT ON (token_id) 
                          token_id,
                          price_after_usd,
                          timestamp
                      FROM arena_trades
                      WHERE status = 'success'
                      ORDER BY token_id, timestamp DESC
                  ) t
                  ON c.internal_id = t.token_id
                  LEFT JOIN token_metadata tm
                  ON c.contract_address = tm.contract_address
                  WHERE 
                      (c.name ILIKE :search OR c.symbol ILIKE :search)
                  ORDER BY marketCap ASC
                  LIMIT 5;`,
                  {
                    replacements: { search: `${search}%` },
                    type: db.Sequelize.QueryTypes.SELECT,
                  }
                );
                
                // return res.status(200).send(Response.sendResponse(true,  dbTokensWithTrades , null, 200));
              }
            } else {
              console.log("No tokens found");
            }
      
            // return res.status(200).send(Response.sendResponse(true, { tokens: dbTokens }, null, 200));
        }
      }

      // Fetch balance data from Glacier API
      const { data } = await axiosInstance.get(
        `https://glacier-api.avax.network/v1/chains/43114/addresses/${wallet_address}/balances:listErc20`,
        {
          params: { 
            pageSize: 200,
            filterSpamTokens: true,
            currency: 'usd',
          },
          headers: {
            accept: 'application/json',
          },
        }
      );


      const erc20Balances = data.erc20TokenBalances;
      const tokensWithBalance = erc20Balances.filter(t => t.balance && BigInt(t.balance) > 1n);
      const tokenAddresses = tokensWithBalance.map(t => t.address.toLowerCase());

      if (tokenAddresses.length > 0) {
        for(let i = 0; i < formattedResponse.length; i++) {
          let found = tokensWithBalance.find(el => el.address.toLowerCase() === formattedResponse[i]?.contract_address?.toLowerCase())
          // console.log("found", found)
          if (formattedResponse[i]) {
            formattedResponse[i].balance =  formattedResponse[i].balance = parseFloat(found?.balance) / 10 ** 18 || 0
          }
        }
        return res.status(200).send({ isSuccess: true, result: formattedResponse, message: null, statusCode: 200 });
      }

    } else if (wallet_address) {
      // Fetch balance data from Glacier API
      console.log("start" , new Date())
      const { data } = await axiosInstance.get(
        `https://glacier-api.avax.network/v1/chains/43114/addresses/${wallet_address}/balances:listErc20`,
        {
          params: {
            pageSize: 200,
            filterSpamTokens: true,
            currency: 'usd',
          },
          headers: {
            accept: 'application/json',
          },
        }
      );
      console.log("end" , new Date())


      const erc20Balances = data.erc20TokenBalances;
      const tokensWithBalance = erc20Balances.filter(t => t.balance && BigInt(t.balance) > 1n);
      const tokenAddresses = tokensWithBalance.map(t => t.address.toLowerCase());

      if (tokenAddresses.length === 0) {
        return res.status(200).send({ isSuccess: true, result: [], message: null, statusCode: 200 });
      }

      // Fetch matching tokens from database to get lp_deployed status
      console.log("start 2" , new Date())
      const dbTokens = await db.sequelize.query(
        `
          SELECT name, symbol, contract_address, lp_deployed, pair_address
          FROM "arena-trade-coins"
          WHERE LOWER(contract_address) IN (:addresses)
        `,
        {
          replacements: { addresses: tokenAddresses },
          type: db.Sequelize.QueryTypes.SELECT,
        }
      );
      // console.log("db", dbTokens)

      let lp_true_tokens = dbTokens.filter(el => el.lp_deployed)
      let lp_false_tokens = dbTokens.filter(el => !el.lp_deployed)


      let processed_data = [];
      // Call DexScreener API for lp_true_tokens
      if (lp_true_tokens.length > 0) {
        const contractAddresses = lp_true_tokens.map(token => token.contract_address).join(',');
        const dexScreenerUrl = `https://api.dexscreener.com/tokens/v1/avalanche/${contractAddresses}`;
        try {
          const response = await axiosInstance.get(dexScreenerUrl);
          processed_data.push(...convertDexDataToCustomFormat(response.data))    
          // return res.status(200).send(Response.sendResponse(true, converted, null, 200));
        } catch (error) {
          console.error("DexScreener API error:", error.message);
        }
      }
      if(lp_false_tokens.length > 0) {
        let lowerCaseTokens = lp_false_tokens.map(el => el.contract_address.toLowerCase())
        let query = `SELECT 
            c.internal_id,
            c.name,
            c.symbol,
            c.lp_deployed,
            c.pair_address,
            c.contract_address,
            (t.price_after_usd * 10000000000) AS marketCap,
            tm.photo_url
        FROM "arena-trade-coins" c
        LEFT JOIN (
            SELECT DISTINCT ON (token_id) 
                token_id,
                price_after_usd,
                timestamp
            FROM arena_trades
            WHERE status = 'success'
            ORDER BY token_id, timestamp DESC
        ) t
        ON c.internal_id = t.token_id
        LEFT JOIN token_metadata tm
        ON c.contract_address = tm.contract_address
        WHERE LOWER(c.contract_address) IN (:contract_addresses)
        LIMIT 5;
      `
        const non_lp_data = await db.sequelize.query(
          query,
          {
            replacements: { contract_addresses: lowerCaseTokens },
            type: db.Sequelize.QueryTypes.SELECT,
          }
        );
        processed_data.push(...non_lp_data)
      }

             // console.log("token", tokensWithBalance)
       for(let i = 0; i < processed_data.length; i++) {
         let found = tokensWithBalance.find(el => el.address.toLowerCase() === processed_data[i]?.contract_address?.toLowerCase())
         // console.log("found", found)
         if (processed_data[i]) {
           processed_data[i].balance =  processed_data[i].balance = parseFloat(found?.balance) / 10 ** 18 || 0
         }
       }


      return res.status(200).send(Response.sendResponse(true, processed_data, null, 200));
    }else if(search){
      const communities = await fetchStarsArenaCommunities(search);
      const response = formatCommunityData(communities);
      return res.status(200).send({ isSuccess: true, result: response, message: null, statusCode: 200 });
    }else {
      const { page, pageSize} = req.query;
      const communities = await StarsArenaTopCommunities(page, pageSize);
      const response = formatCommunityData(communities);

      return res.status(200).send({ isSuccess: true, result: response, message: null, statusCode: 200 });
    }
  } catch (err) {
    console.log("err",err)
    return res.status(500).send(Response.sendResponse(false, null, 'Error occurred', 500));
  }
};



const tokenListTokensNew = async (req, res) => {
  try {
    let { search } = req.query;

    if (!search) {
      search = 'l'
    }

    let _isContractAddress = await isContractAddress(search)


    if(_isContractAddress) {
      // Find token by contract address from arena-trade-coins
      const tokenByContract = await db.sequelize.query(
        `SELECT lp_deployed FROM "arena-trade-coins" WHERE LOWER(contract_address) = LOWER(:contract_address)`,
        {
          replacements: { contract_address: search },
          type: db.Sequelize.QueryTypes.SELECT,
        }
      );

      console.log("token", tokenByContract)

      if (tokenByContract.length > 0) {
        const token = tokenByContract[0];
        
        // If lp_deployed is true, call DexScreener API
        if (token.lp_deployed == true) {  
          const avalanchePairs = await fetchDexScreenerData(search);
          const formattedResponse = convertDexDataToCustomFormat(avalanchePairs);
          return res.status(200).send(Response.sendResponse(true, [formattedResponse[0]], null, 200));
        } else {
          // Return the token data from database
          const dbTokensWithTrades = await db.sequelize.query(
            `SELECT 
                c.internal_id,
                c.name,
                c.symbol,
                c.lp_deployed,
                c.pair_address,
                c.contract_address,
                (t.price_after_usd * 10000000000) AS marketCap,
                tm.photo_url
                FROM "arena-trade-coins" c
                LEFT JOIN (
                    SELECT DISTINCT ON (token_id) 
                        token_id,
                        price_after_usd,
                        timestamp
                    FROM arena_trades
                    WHERE status = 'success'
                    ORDER BY token_id, timestamp DESC
                ) t
                ON c.internal_id = t.token_id
                LEFT JOIN token_metadata tm
                ON c.contract_address = tm.contract_address
                  WHERE LOWER(c.contract_address) = LOWER(:contract_address)
                LIMIT 5;`,
              {
                replacements: { contract_address: `${search}` },
                type: db.Sequelize.QueryTypes.SELECT,
              }
          );
          return res.status(200).send(Response.sendResponse(true, dbTokensWithTrades, null, 200));
        }
      }
    }

    else {
      if(search.length <= 2) {
        const start = Date.now();
        const avalanchePairs = await fetchDexScreenerData(search);
        const _end = Date.now();
        const formattedResponse = convertDexDataToCustomFormat(avalanchePairs);
        const end = Date.now();
        console.log(`Dexscreener API call took ${_end - start} ms ${end}`);
        return res.status(200).send(Response.sendResponse(true, formattedResponse, null, 200));
      } else {
        // Query arena-trade-coins table for tokens matching the search
        const dbTokens = await db.sequelize.query(
          `SELECT lp_deployed FROM "arena-trade-coins" WHERE name ILIKE :search OR symbol ILIKE :search ORDER BY lp_deployed DESC LIMIT 3`,
          {
            replacements: { search: `${search}%` },
            type: db.Sequelize.QueryTypes.SELECT,
          }
        );
  
        // Check if majority of tokens have lp_deployed as true or false
        if (dbTokens.length > 0) {
          const deployedCount = dbTokens.filter(token => token.lp_deployed === true).length;
          const notDeployedCount = dbTokens.filter(token => token.lp_deployed === false).length;
          
          if (deployedCount > notDeployedCount) {
            const avalanchePairs = await fetchDexScreenerData(search);
            const formattedResponse = convertDexDataToCustomFormat(avalanchePairs);
            return res.status(200).send(Response.sendResponse(true, formattedResponse, null, 200));
          } else {
            console.log("Equal number of deployed and non-deployed tokens");
            
            // Query arena-trade-coins table with join from arena_trades
            const dbTokensWithTrades = await db.sequelize.query(
              `SELECT 
                  c.internal_id,
                  c.name,
                  c.symbol,
                  c.lp_deployed,
                  c.pair_address,
                  c.contract_address,
                  (t.price_after_usd * 10000000000) AS marketCap,
                  tm.photo_url
              FROM "arena-trade-coins" c
              LEFT JOIN (
                  SELECT DISTINCT ON (token_id) 
                      token_id,
                      price_after_usd,
                      timestamp
                  FROM arena_trades
                  WHERE status = 'success'
                  ORDER BY token_id, timestamp DESC
              ) t
              ON c.internal_id = t.token_id
              LEFT JOIN token_metadata tm
              ON c.contract_address = tm.contract_address
              WHERE 
                  (c.name ILIKE :search OR c.symbol ILIKE :search)
              ORDER BY marketCap ASC
              LIMIT 5;`,
              {
                replacements: { search: `${search}%` },
                type: db.Sequelize.QueryTypes.SELECT,
              }
            );
            
            return res.status(200).send(Response.sendResponse(true,  dbTokensWithTrades , null, 200));
          }
        } else {
          console.log("No tokens found");
        }
  
        // return res.status(200).send(Response.sendResponse(true, { tokens: dbTokens }, null, 200));
      }
    }
  } catch (err) {
    console.error("Error in tokenListTokensNew:", err);
    return res.status(500).send(Response.sendResponse(false, null, "Error occurred", 500));
  }
}

const tokenListTokensMerged = async (req, res) => {
  try {
    let { search, wallet_address } = req.query;

    const _isContractAddress = await isContractAddress(search);

    // 🔹 If search is a contract address
    if (_isContractAddress) {

      const tokenByContract = await db.sequelize.query(
        `SELECT lp_deployed FROM "arena-trade-coins" WHERE LOWER(contract_address) = LOWER(:contract_address)`,
        {
          replacements: { contract_address: search },
          type: db.Sequelize.QueryTypes.SELECT,
        }
      );


      if (tokenByContract.length > 0) {
        const token = tokenByContract[0];

        if (token.lp_deployed === true) {
          const cacheKey = `dex:contract:${search.toLowerCase()}`;
          const cached = await redisClient.get(cacheKey);

          if (cached) {
            const formatted = JSON.parse(cached);
            return res.status(200).send(Response.sendResponse(true, [formatted[0]], null, 200));
          } else {

            const avalanchePairs = await fetchDexScreenerData(search);
            const formatted = convertDexDataToCustomFormat(avalanchePairs);
            await redisClient.set(cacheKey, JSON.stringify(formatted), { EX: 120 });
            return res.status(200).send(Response.sendResponse(true, [formatted[0]], null, 200));
          }
        } else {
          const dbTokensWithTrades = await db.sequelize.query(  
            `SELECT 
                c.internal_id,
                c.name,
                c.symbol,
                c.lp_deployed,
                c.pair_address,
                c.contract_address,
                (t.price_after_usd * 10000000000) AS marketCap,
                tm.photo_url
            FROM "arena-trade-coins" c
            LEFT JOIN LATERAL (
                SELECT token_id, price_after_usd, timestamp
                FROM arena_trades
                WHERE status = 'success' AND token_id = c.internal_id
                ORDER BY timestamp DESC
                LIMIT 1
            ) t ON true
            LEFT JOIN token_metadata tm ON c.contract_address = tm.contract_address
            WHERE LOWER(c.contract_address) = LOWER(:contract_address)
            LIMIT 1;`,
            {
              replacements: { contract_address: search },
              type: db.Sequelize.QueryTypes.SELECT,
            }
          );
          return res.status(200).send(Response.sendResponse(true, dbTokensWithTrades, null, 200));
        }
      }
    }

    // 🔹 If search is short (e.g., symbol like "usdt")
    if (search?.length <= 2 || !search) {
      const cacheKey = `dex:search:${search?.toLowerCase()}`;
      const cached = await redisClient.get(cacheKey);
      if (cached) {
        const formattedResponse = JSON.parse(cached);
        return res.status(200).send(Response.sendResponse(true, formattedResponse, null, 200));
      } else {
        const avalanchePairs = await fetchDexScreenerData(search);
        const formattedResponse = convertDexDataToCustomFormat(avalanchePairs);
        await redisClient.set(cacheKey, JSON.stringify(formattedResponse), { EX: 120 });
        return res.status(200).send(Response.sendResponse(true, formattedResponse, null, 200));
      }
    }

    // 🔹 Name or symbol match from DB
    const dbTokens = await db.sequelize.query(
      `SELECT lp_deployed FROM "arena-trade-coins" WHERE name ILIKE :search OR symbol ILIKE :search ORDER BY lp_deployed DESC LIMIT 3`,
      {
        replacements: { search: `${search}%` },
        type: db.Sequelize.QueryTypes.SELECT,
      }
    );

    if (dbTokens.length > 0) {
      const deployedCount = dbTokens.some(token => token.lp_deployed === true);

      if (deployedCount) {
        const cacheKey = `dex:search:${search.toLowerCase()}`;
        const cached = await redisClient.get(cacheKey);

        if (cached) {
          const formattedResponse = JSON.parse(cached);
          return res.status(200).send(Response.sendResponse(true, formattedResponse, null, 200));
        } else {
          const avalanchePairs = await fetchDexScreenerData(search);
          const formattedResponse = convertDexDataToCustomFormat(avalanchePairs);
          await redisClient.set(cacheKey, JSON.stringify(formattedResponse), { EX: 120 });
          return res.status(200).send(Response.sendResponse(true, formattedResponse, null, 200));
        }
      } else {
        const dbTokensWithTrades = await db.sequelize.query(
          `SELECT 
              c.internal_id, c.name, c.symbol, c.lp_deployed, c.pair_address, c.contract_address,
              (t.price_after_usd * 10000000000) AS marketCap, tm.photo_url
          FROM "arena-trade-coins" c
          LEFT JOIN LATERAL (
                SELECT token_id, price_after_usd, timestamp
                FROM arena_trades
                WHERE status = 'success' AND token_id = c.internal_id
                ORDER BY timestamp DESC
                LIMIT 1
            ) t ON true
          LEFT JOIN token_metadata tm ON c.contract_address = tm.contract_address
          WHERE c.name ILIKE :search OR c.symbol ILIKE :search
          ORDER BY marketCap ASC
          LIMIT 5;`,
          {
            replacements: { search: `${search}%` },
            type: db.Sequelize.QueryTypes.SELECT,
          }
        );
        return res.status(200).send(Response.sendResponse(true, dbTokensWithTrades, null, 200));
      }
    }

    // 🔚 Fallback if nothing found
    return res.status(200).send(Response.sendResponse(true, [], null, 200));
  } catch (err) {
    console.error("Merged Function Error:", err);
    return res.status(500).send(Response.sendResponse(false, null, 'Error occurred', 500));
  }
};



const tokenListArenaPro = async (req, res) => {
  try {
    const { q } = req.query;
    
    if (!q) {
      return res.status(400).send(Response.sendResponse(false, null, "Search query 'q' is required", 400));
    }

    const url = `https://api.arenapro.io/tokens_view?or=(creator_twitter_handle.ilike.*${q}*,creator_address.ilike.*${q}*,token_contract_address.ilike.*${q}*,token_name.ilike.*${q}*,token_symbol.ilike.*${q}*)&order=latest_price_usd.desc&limit=20`;
    
    const response = await axios.get(url);
    
    // Filter tokens where a > 0
    const filteredData = response.data.filter(token => token.a > 0);
    
    return res.status(200).send(Response.sendResponse(true, filteredData, null, 200));
  } catch (err) {
    console.error("Error in tokenListArenaPro:", err);
    return res.status(500).send(Response.sendResponse(false, null, "Error occurred", 500));
  }
}

const communitiesListOfTokenController = async (req, res) => {
  try {
    const { search } = req.query;

    if (!search) {
      return res.status(400).send({isSuccess: false,result: null,message: "Missing search query parameter",statusCode: 400});
    }

    const communities = await fetchStarsArenaCommunities(search);
    const response = formatCommunityData(communities);

    return res.status(200).send({isSuccess: true,result: response,message: null,statusCode: 200});
    // Step 2: Get token list
    // const token_details = await db.sequelize.query(
    //   `SELECT atc.contract_address, atc.id, atc.lp_deployed, atc.symbol, atc.lp_deployed, atc.pair_address, atc.name, atc.internal_id, atc.system_created, tm.photo_url AS photo_url
    //    FROM "arena-trade-coins" AS atc
    //    LEFT JOIN token_metadata AS tm ON atc.contract_address = tm.contract_address
    //    WHERE 1=1 ${search_key}
    //    ORDER BY atc.lp_deployed DESC
    //    LIMIT :count OFFSET :offset`,
    //   {
    //     replacements,
    //     type: db.Sequelize.QueryTypes.SELECT,
    //   }
    // );

    // const latestPriceRes = await db.sequelize.query(
    //   `SELECT price FROM avax_price_live ORDER BY fetched_at DESC LIMIT 1`,
    //   { type: db.Sequelize.QueryTypes.SELECT }
    // );

    // const avax_price = parseFloat(latestPriceRes[0].price);

    // // Step 3: For each token, get extra data in parallel
    // let token_data = await Promise.all(
    //   token_details.map(async (data) => {
    //     if (data.lp_deployed === true) {
    //       const url = `https://api.dexscreener.com/latest/dex/pairs/avalanche/${data.pair_address}`;
    //       const response = await axios.get(url);
    //       const pairInfo = response.data?.pair;
    //       try {
    //         if (pairInfo) {
    //           return {
    //             ...data,
    //             priceUsd: pairInfo?.priceUsd,
    //             volume: pairInfo?.volume.h24,
    //             marketCap: pairInfo?.marketCap
    //           };
    //         }
    //       } catch (err) {
    //         console.error(`Dexscreener error for pair_address ${data.pair_address}:`, err.message);
    //       }
    //     } else {
    //       const trades = await db.ArenaTrade.findAll({
    //         where: {
    //           token_id: data.internal_id,
    //         },
    //       });

    //       const tradeMap = {};
    //       for (const trade of trades) {
    //         const tid = trade.token_id;
    //         if (!tradeMap[tid]) tradeMap[tid] = [];
    //         tradeMap[tid].push(trade);
    //       }

    //       const tokenTrades = tradeMap[data.internal_id] || [];

    //       // 🟩 Calculate latest trade by absolute_tx_position
    //       tokenTrades.sort((a, b) => {
    //         const aPos = BigInt(a.absolute_tx_position || 0);
    //         const bPos = BigInt(b.absolute_tx_position || 0);
    //         return aPos > bPos ? 1 : aPos < bPos ? -1 : 0;
    //       });

    //       const latestTrade = tokenTrades[tokenTrades.length - 1] || null;
    //       const latest_trade_absolute_order = latestTrade?.absolute_tx_position || null;

    //       const latest_price_eth = latestTrade?.price_after_eth
    //         ? parseFloat(latestTrade.price_after_eth)
    //         : 0;

    //       const latest_price_usd = latest_price_eth * avax_price;

    //       // 🟩 Sum of transferred AVAX
    //       const latest_total_volume_eth = tokenTrades.reduce(
    //         (sum, t) => sum + parseFloat(t.transferred_avax || 0),
    //         0
    //       );

    //       const latest_total_volume_usd = latest_total_volume_eth * avax_price;

    //       // 🟩 Calculate latest_supply_eth using BigInt
    //       const initialBuyAmount = tokenTrades
    //         .filter((t) => t.action === "initial buy")
    //         .reduce((sum, t) => sum + BigInt(t.amount || "0"), 0n);

    //       const totalBuyAmount = tokenTrades
    //         .filter((t) => t.action === "buy")
    //         .reduce((sum, t) => sum + BigInt(t.amount || "0"), 0n);

    //       const totalSellAmount = tokenTrades
    //         .filter((t) => t.action === "sell")
    //         .reduce((sum, t) => sum + BigInt(t.amount || "0"), 0n);

    //       const latest_supply_wei = initialBuyAmount + totalBuyAmount - totalSellAmount;
    //       const latest_supply_eth = Number(latest_supply_wei) / 1e18;

    //       return {
    //         ...data,
    //         priceUsd: latest_price_usd,
    //         volume: latest_total_volume_usd,
    //         marketCap: latest_supply_eth * latest_price_usd
    //       };
    //     }
    //   })
    // );

    // let response = token_data.sort((a, b) => b.marketCap - a.marketCap);

    // return res
    //   .status(200)
    //   .send(Response.sendResponse(true, { response, length: Number(token_count[0].total) }, null, 200));
  } catch (err) {
    return res.status(500).send({ isSuccess: false, result: null, message: "Error occurred", statusCode: 500 });
  }
};

const myHoldingTokens = async (req, res) => {
  try {
    const { wallet_address, pair_address } = req.query;

    if (!wallet_address || !pair_address) {
      return res.status(400).send(Response.sendResponse(false, null, "Missing parameters", 400));
    }

    // Query to get token holdings data
    const response = await db.sequelize.query(
      `SELECT atc.pair_address,atc.contract_address,atc.lp_deployed,atc.name,tm.photo_url AS photo_url
       FROM "arena-trade-coins" AS atc
       LEFT JOIN token_metadata AS tm ON atc.contract_address = tm.contract_address
       WHERE LOWER(atc.pair_address) = LOWER(:pair_address) LIMIT 1;`,
      {
        replacements: {
          pair_address: pair_address.toLowerCase()
        },
        type: db.sequelize.QueryTypes.SELECT,
      }
    );

    if (!response || response.length === 0) {
      return res.status(400).send(Response.sendResponse(false, null, "Token Not Found", 400));
    }

    const contract = new ethers.Contract(response[0].contract_address, ERC20_ABI, provider);
    const [balance, decimals] = await Promise.all([
      contract.balanceOf(wallet_address.toLowerCase()),
      contract.decimals()
    ]);

    const formattedBalance = Number(ethers.formatUnits(balance, decimals)).toFixed(2);
    response[0].amount = formattedBalance;
    let usdPrice = 0;
    response[0].priceUsd = usdPrice;

    return res.status(200).send(Response.sendResponse(true, response, "Data retrieved", 200));

  } catch (err) {
    // console.log("eee",err)
    return res.status(500).send(Response.sendResponse(false, null, "Internal Server Error", 500));
  }
};

const holdersTokens = async (req, res) => {
  try {
    const { pair_address } = req.params;
    const { limit, offset } = req.query;
    if (!pair_address) {
      return res.status(400).send(Response.sendResponse(false, null, "Missing pair address parameter", 400));
    }

    const response = await db.sequelize.query(
      `SELECT at.from_address, atc.pair_address, atc.contract_address, atc.lp_deployed, atc.internal_id ,atc.supply
        FROM "arena-trade-coins" AS atc
        LEFT JOIN "arena_trades" AS at ON at.token_id = atc.internal_id
        WHERE LOWER(pair_address) = LOWER(:pair_address)
        GROUP BY at.from_address, atc.pair_address, atc.contract_address, atc.internal_id,atc.supply,atc.lp_deployed
        LIMIT :limit OFFSET :offset`,
      {
        replacements: { pair_address: pair_address, limit: Number(limit) || 10, offset: Number(offset) || 0 },
        type: db.Sequelize.QueryTypes.SELECT,
      }
    );
    for (let i = 0; i < response.length; i++) {
      const contract = new ethers.Contract(response[i].contract_address, ERC20_ABI, provider);
      const [balance, decimals] = await Promise.all([
        contract.balanceOf(response[i].from_address),
        contract.decimals()
      ]);
      const formattedBalance = ethers.formatUnits(balance, decimals);
      const formattedSupply = ethers.formatUnits(BigInt(response[i].supply), decimals);
      const percentOfSupply = (Number(formattedBalance) / Number(formattedSupply)) * 100;
      response[i].amount = formattedBalance;
      response[i].percentOfSupply = percentOfSupply.toFixed(2);
    }

    return res.status(200).send(Response.sendResponse(true, { response }, "Holders Data", 200));
  } catch (err) {
    return res.status(500).send(Response.sendResponse(false, null, "Internal Server Error", 500));
  }
};

const transactionBuySellHistory = async (req, res) => {
  try {
    const { pair_address } = req.params;
    const limit = Number(req.query.limit) || 10;
    const offset = Number(req.query.offset) || 0;

    const walletDataList = await db.sequelize.query(
      `SELECT atc.contract_address, atc.symbol, atc.name , atc.pair_address , atc.lp_deployed , atc.creator_address
       FROM "arena-trade-coins" AS atc
       WHERE LOWER(atc.pair_address) = LOWER(:pair_address)`,
      {
        replacements: {
          pair_address: pair_address.toLowerCase()
        },
        type: db.Sequelize.QueryTypes.SELECT,
      }
    );

    if (!pair_address) {
      return res.status(400).send(
        Response.sendResponse(false, null, "Pair address is required", 400)
      );
    }

    let contract_address = walletDataList[0]?.contract_address;
    if (!contract_address) {
      return res.status(400).send(
        Response.sendResponse(false, null, "Contract address is required", 400)
      );
    }

    const tradeData = await db.sequelize.query(
      `
      SELECT 
        at.id AS row_id,
        atc.contract_address,
        at.from_address AS user_address,
        at.amount,
        at.token_id,
        at.action,
        at.timestamp,
        at.transferred_avax,
        atc.lp_deployed
      FROM "arena-trade-coins" AS atc 
      LEFT JOIN "arena_trades" AS at ON atc.internal_id = at.token_id
      WHERE LOWER(atc.contract_address) = LOWER(:contract_address)
      ORDER BY at.timestamp DESC
      LIMIT :limit OFFSET :offset
      `,
      {
        replacements: {
          contract_address: contract_address.toLowerCase(),
          limit,
          offset,
        },
        type: db.Sequelize.QueryTypes.SELECT,
      }
    );


    const formattedItems = tradeData.map(item => {
      let humanReadable = web3.utils.fromWei(item.amount.toString(), 'ether');
      let formattedAmount = Number(humanReadable).toLocaleString("en-US");
      let formattedAvax = parseFloat(item.transferred_avax).toFixed(2);
      return {
        ...item,
        amount: formattedAmount,
        transferred_avax: formattedAvax,
        lp_deployed: item.lp_deployed
      };
    });

    return res.status(200).send(
      Response.sendResponse(true, {
        offset,
        limit,
        items: formattedItems,
      }, "Trade history fetched successfully", 200)
    );
  } catch (err) {
    return res.status(500).send(
      Response.sendResponse(false, null, "Internal Server Error", 500)
    );
  }
};

const tokenTradeAnalysisData = async (req, res) => {
  try {
    const { pair_address } = req.params;
    if (!pair_address) {
      return res
        .status(400)
        .send(Response.sendResponse(false, null, "Contract address is required", 400));
    }

    const walletDataList = await db.sequelize.query(
      `SELECT atc.contract_address, atc.symbol, atc.name , atc.lp_deployed ,atc.pair_address , atc.creator_address
       FROM "arena-trade-coins" AS atc
       WHERE LOWER(atc.pair_address) = LOWER(:pair_address)`,
      {
        replacements: {
          pair_address: pair_address.toLowerCase()
        },
        type: db.Sequelize.QueryTypes.SELECT,
      }
    );

    let contract_address = walletDataList[0]?.contract_address;
    let lp_deployed = walletDataList[0].lp_deployed;
    const url = `https://api.arenapro.io/rpc/token_trade_analytics?in_token_contract_address=${contract_address}&in_time_period=24h`;

    const response = await axios.get(url);
    response.data[0].lp_deployed = lp_deployed

    return res.status(200).send(
      Response.sendResponse(true, response.data, "Token trade analytics fetched successfully", 200)
    );
  } catch (err) {

    return res
      .status(500)
      .send(Response.sendResponse(false, null, "Internal Server Error", 500));
  }
};

const tokenOhlcData = async (req, res) => {
  try {
    const { pair_address } = req.params;
    const { in_timeframe = '5m' } = req.query;

    if (!pair_address) {
      return res
        .status(400)
        .send(Response.sendResponse(false, null, "Contract address is required", 400));
    }

    const walletDataList = await db.sequelize.query(
      `SELECT atc.contract_address, atc.symbol, atc.name , atc.pair_address , atc.creator_address
       FROM "arena-trade-coins" AS atc
       WHERE LOWER(atc.pair_address) = LOWER(:pair_address)`,
      {
        replacements: {
          pair_address: pair_address.toLowerCase()
        },
        type: db.Sequelize.QueryTypes.SELECT,
      }
    );

    let contract_address = walletDataList[0]?.contract_address;

    const url = `https://api.arenapro.io/rpc/token_ohlc?in_token_contract_address=${contract_address}&in_timeframe=${in_timeframe}`;

    const response = await axios.get(url);

    return res.status(200).send(
      Response.sendResponse(true, response.data, "Token OHLC data fetched successfully", 200)
    );
  } catch (err) {

    return res
      .status(500)
      .send(Response.sendResponse(false, null, "Internal Server Error", 500));
  }
};

const communitiesTopController = async (req, res) => {
  try {
    const { page, pageSize} = req.query;
    const communities = await StarsArenaTopCommunities(page, pageSize);
    const response = formatCommunityData(communities);
    return res.status(200).send({isSuccess: true,result: response,message: null,statusCode: 200});
  } catch (err) {
    return res.status(500).send(Response.sendResponse(false, null, "Error occurred", 500));
  }
};

const getInternalIdByPairAddressData = async (req, res) => {
  try {
    let { pair_address } = req.params;
    const response = await db.sequelize.query(
      `SELECT internal_id FROM "arena-trade-coins" WHERE LOWER(pair_address) = LOWER(:pair_address)`,
      {
        replacements: { pair_address: pair_address.toLowerCase() },
        type: db.Sequelize.QueryTypes.SELECT,
      }
    );
    return res.status(200).send(Response.sendResponse(true, response, null, 200));
  } catch (err) {
    return res.status(500).send(Response.sendResponse(false, null, "Error fetching internal ID by pair address:", 500));
  }
};

const getAllTokenBalance = async (req, res) => {
  try {
    const { wallet_address, contract_address } = req.query;

    if (!wallet_address || !contract_address) {
      return res.status(400).send(Response.sendResponse(false, null, "Missing parameters", 400));
    }

    const contract = new ethers.Contract(contract_address, ERC20_ABI, provider);
    const [balance, decimals] = await Promise.all([
      contract.balanceOf(wallet_address),
      contract.decimals()
    ]);

    const formatted = ethers.formatUnits(balance, decimals);
    const response = parseFloat(formatted).toFixed(2);

    return res.status(200).send(Response.sendResponse(true, response, null, 200));
  } catch (err) {
    return res.status(500).send(Response.sendResponse(false, null, "Error fetching internal ID by pair address:", 500));
  }
}

const walletHoldings = async (req, res) => {
  try {
    const { wallet_address } = req.query;
    if (!wallet_address) {
      return res.status(400).send(Response.sendResponse(false, null, 'Missing wallet address', 400));
    }

    // Step 1: Fetch balances from Glacier API
    const { data } = await axios.get(
      `https://glacier-api.avax.network/v1/chains/43114/addresses/${wallet_address}/balances:listErc20`,
      {
        params: {
          pageSize: 500,
          filterSpamTokens: true,
          currency: 'usd',
        },
        headers: {
          accept: 'application/json',
        },
      }
    );

    const erc20Balances = data.erc20TokenBalances || [];

    // Step 2: Filter tokens with raw balance > 1n
    const tokensWithBalance = erc20Balances.filter(t => {
      return t.balance && BigInt(t.balance) > 1n;
    });

    const tokenAddresses = tokensWithBalance.map(t => t.address.toLowerCase());

    if (tokenAddresses.length === 0) {
      return res.status(200).send(Response.sendResponse(true, [], null, 200));
    }

    // Step 3: Match with tokens in DB that are LP deployed
    const dbTokens = await db.sequelize.query(
      `
      SELECT name, symbol, contract_address, lp_deployed
      FROM "arena-trade-coins"
      WHERE LOWER(contract_address) IN (:addresses)
      `,
      {
        replacements: { addresses: tokenAddresses },
        type: db.Sequelize.QueryTypes.SELECT,
      }
    );

    const dbTokenMap = new Map(
      dbTokens.map(t => [t.contract_address.toLowerCase(), t])
    );

    // Step 4: Merge and filter by balance >= 1
    const finalList = tokensWithBalance
      .map(t => {
        const match = dbTokenMap.get(t.address.toLowerCase());
        if (!match) return null;

        const balance = parseFloat(t.balance) / 10 ** t.decimals;
        if (balance < 1) return null;

        return {
          name: match.name || t.name,
          symbol: match.symbol || t.symbol,
          lp_deployed: match.lp_deployed || false,
          contract_address: t.address,
          balance,
          logo: t.logoUri || null,
        };
      })
      .filter(Boolean);

    return res.status(200).send(Response.sendResponse(true, finalList, null, 200));
  } catch (err) {
    console.error('❌ Error in walletHoldings:', err.message);
    return res.status(500).send(Response.sendResponse(false, null, 'Error fetching wallet holdings', 500));
  }
};



module.exports = {
  recentTokens,
  pairTokenData,
  pairTokenDataNew,
  tokenListTokens,
  myHoldingTokens,
  transactionBuySellHistory,
  tokenTradeAnalysisData,
  tokenOhlcData,
  communitiesTopController,
  communitiesListOfTokenController,
  holdersTokens,
  getInternalIdByPairAddressData,
  getAllTokenBalance,
  walletHoldings,
  tokenListTokensNew,
  tokenListArenaPro,
  tokenListTokensMerged
}