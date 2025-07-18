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
const {sumAmountByAction, getSupplyEth} = require('../utils/calculateMarketCap');
const { getLastestAvaxPrice } = require('../services/getLatestAvaxPrice.js');
const { getSumOfTotalBuyAndSell } = require('../utils/calculatingPriceEth.js');

/**
 * Utility to sum token amounts by action type
 * @param {Array} trades - Array of trade objects
 * @param {string} action - Action type to filter (e.g., 'buy', 'sell', 'initial buy')
 * @returns {bigint} Sum of amounts for the given action
 */


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
        status: 'success'
      },
    });

    const tradeMap = {};
    for (const trade of trades) {
      const tid = trade.token_id;
      if (!tradeMap[tid]) tradeMap[tid] = [];
      tradeMap[tid].push(trade);
    }

    const latestPriceRes = await getLastestAvaxPrice()

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


        const latest_price_usd = latest_price_eth * latestTrade?.avax_price;

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
        const initialBuyAmount = sumAmountByAction(tokenTrades, "initial buy");
        const totalBuyAmount = sumAmountByAction(tokenTrades, "buy");
        const totalSellAmount = sumAmountByAction(tokenTrades, "sell");
        const latest_supply_eth = getSupplyEth(initialBuyAmount, totalBuyAmount, totalSellAmount)
        

        const tokenMetadata = await db.TokenMetadata.findOne({
          where: { bc_group_id: token.internal_id },
        });
        // latest_supply_eth: Number(latest_supply_eth.toFixed(6)),
        // latest_price_usd: Number(latest_price_usd.toFixed(12)),
        
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

    const pairData = await db.sequelize.query(
      `SELECT atc.contract_address, atc.symbol, atc.name, atc.pair_address, atc.lp_deployed, atc.creator_address, atc.internal_id, atc.supply, atc.system_created
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
              at.action, at.from_address, at.amount, atc.name, at.timestamp, at.status, at.transferred_avax, at.avax_price, at.price_after_eth, at.price_after_usd
       FROM "arena_trades" AS at 
       LEFT JOIN "arena-trade-coins" AS atc ON at.token_id = atc.internal_id 
       WHERE LOWER(atc.pair_address) = LOWER(:pair_address) AND at.status = 'success'
       ORDER BY at.timestamp ASC`,
      {
        replacements: { pair_address: token.pair_address },
        type: db.Sequelize.QueryTypes.SELECT,
      }
    );

    // 🟩 Calculate latest_supply_eth using BigInt
    const initialBuyAmount = sumAmountByAction(token_data, "initial buy");

    const totalBuyAmount = sumAmountByAction(token_data, "buy");

    const totalSellAmount = sumAmountByAction(token_data, "sell");

    const latest_supply_wei = initialBuyAmount + totalBuyAmount - totalSellAmount;
    const latest_supply_eth = Number(latest_supply_wei) / 1e18;

    const latest_data = token_data.length > 0 ? [token_data[token_data.length - 1]] : [];
    const latestTrade = latest_data[0] || {};
    const priceNative = Number(latestTrade.price_after_eth || 0);
    const priceUsd = Number(latestTrade.price_after_usd || 0);


    const totalSupply = 1e10;

    // latest_price_eth
    const marketCap =  Number(latest_supply_eth.toFixed(6)) *  Number(priceUsd.toFixed(12)) 

    const fdv = marketCap;

    const latestPriceRes = await db.sequelize.query(
      `SELECT price FROM avax_price_live ORDER BY fetched_at DESC LIMIT 1`,
      { type: db.Sequelize.QueryTypes.SELECT }
    );
    const avax_price = latestPriceRes.length ? Number(latestPriceRes[0].price) : 0;

    // 5️⃣ Timeframes
    const now = Date.now();
    const timeframes = {
      m5: 5 * 60 * 1000,
      h1: 60 * 60 * 1000,
      h6: 6 * 60 * 60 * 1000,
      h24: 24 * 60 * 60 * 1000,
    };

    function getVolumeByTimeframeJS(trades) {
      const result = {};
      for (const [key, ms] of Object.entries(timeframes)) {
        result[key] = trades
          .filter(t => t.status === 'success' && (now - new Date(t.timestamp).getTime()) <= ms)
          .reduce((sum, t) => sum + parseFloat(t.transferred_avax || 0), 0);
      }
      return result;
    }

    function getBuySellCountsByTimeframeJS(trades) {
      const result = {};
      for (const [key, ms] of Object.entries(timeframes)) {
        const filtered = trades.filter(t => t.status === 'success' && (now - new Date(t.timestamp).getTime()) <= ms);
        result[key] = {
          buys: filtered.filter(t => t.action === 'buy' || t.action === 'initial buy').length,
          sells: filtered.filter(t => t.action === 'sell').length,
        };
      }
      return result;
    }

    function getParticipantsByTimeframeJS(trades) {
      const result = {};
      for (const [key, ms] of Object.entries(timeframes)) {
        const filtered = trades.filter(t => t.status === 'success' && (now - new Date(t.timestamp).getTime()) <= ms);
        result[key] = {
          buyers: new Set(filtered.filter(t => t.action === 'buy' || t.action === 'initial buy').map(t => t.from_address)).size,
          sellers: new Set(filtered.filter(t => t.action === 'sell').map(t => t.from_address)).size,
          makers: new Set(filtered.map(t => t.from_address)).size,
        };
      }
      return result;
    }

    function getBuySellVolumeByTimeframeJS(trades, avax_price) {
      const result = {};
      for (const [key, ms] of Object.entries(timeframes)) {
        const filtered = trades.filter(t => t.status === 'success' && (now - new Date(t.timestamp).getTime()) <= ms);
        result[key] = {
          buy: filtered.filter(t => t.action === 'buy' || t.action === 'initial buy').reduce((sum, t) => sum + parseFloat(t.transferred_avax || 0) * avax_price, 0),
          sell: filtered.filter(t => t.action === 'sell').reduce((sum, t) => sum + parseFloat(t.transferred_avax || 0) * avax_price, 0),
        };
      }
      return result;
    }

    // 10️⃣ Calculate all metrics
    const volume = getVolumeByTimeframeJS(token_data);
    const volume_usd = {
      m5: Number((volume.m5 * avax_price).toFixed(2)),
      h1: Number((volume.h1 * avax_price).toFixed(2)),
      h6: Number((volume.h6 * avax_price).toFixed(2)),
      h24: Number((volume.h24 * avax_price).toFixed(2)),
    };

    const txns = getBuySellCountsByTimeframeJS(token_data);

    const participantsRaw = getParticipantsByTimeframeJS(token_data);
    const participants = {
      m5: { buyers: participantsRaw.m5.buyers, sellers: participantsRaw.m5.sellers, makers: participantsRaw.m5.buyers + participantsRaw.m5.sellers },
      h1: { buyers: participantsRaw.h1.buyers, sellers: participantsRaw.h1.sellers, makers: participantsRaw.h1.buyers + participantsRaw.h1.sellers },
      h6: { buyers: participantsRaw.h6.buyers, sellers: participantsRaw.h6.sellers, makers: participantsRaw.h6.buyers + participantsRaw.h6.sellers },
      h24: { buyers: participantsRaw.h24.buyers, sellers: participantsRaw.h24.sellers, makers: participantsRaw.h24.buyers + participantsRaw.h24.sellers },
    };

    const buySellVolume = getBuySellVolumeByTimeframeJS(token_data, avax_price);
    const buySellVolume_usd = {
      m5: {
        buy: Number(buySellVolume.m5.buy.toFixed(2)),
        sell: Number(buySellVolume.m5.sell.toFixed(2)),
      },
      h1: {
        buy: Number(buySellVolume.h1.buy.toFixed(2)),
        sell: Number(buySellVolume.h1.sell.toFixed(2)),
      },
      h6: {
        buy: Number(buySellVolume.h6.buy.toFixed(2)),
        sell: Number(buySellVolume.h6.sell.toFixed(2)),
      },
      h24: {
        buy: Number(buySellVolume.h24.buy.toFixed(2)),
        sell: Number(buySellVolume.h24.sell.toFixed(2)),
      },
    };

    const tokenMetadata = await db.TokenMetadata.findOne({
      where: { bc_group_id: token.internal_id },
    });

    const latest_holder_count = new Set(
      token_data.map((t) => t.from_address && t.from_address.toLowerCase())
    ).size;

    const imageUrl = tokenMetadata ? tokenMetadata.photo_url : null;

    const liquidityQuote = token_data.reduce((sum, t) => sum + parseFloat(t.transferred_avax || 0), 0);
    const liquidityUsd = liquidityQuote * avax_price;
    const liquidityBase = totalSupply;

    return res.status(200).json({
      isSuccess: true,
      result: {
        token: "prebonded",
        lp_deployed: token.lp_deployed,
        chainId: "avalanche",
        dexId: "arenatrade",
        url: `https://dexscreener.com/avalanche/${token.pair_address}`,
        pairAddress: token.pair_address,
        baseToken: {
          address: token.contract_address,
          name: token.name,
          symbol: token.symbol,
        },
        quoteToken: {
          address: "0xB31f66AA3C1e785363F0875A1B74E27b85FD66c7",
          name: "Wrapped AVAX",
          symbol: "WAVAX",
        },
        priceNative: priceNative.toFixed(10),
        priceUsd: priceUsd.toFixed(9),
        txns,
        volume: volume_usd,
        liquidity: {
          usd: Number(liquidityUsd.toFixed(2)),
          base: Number(liquidityBase.toFixed(2)),
          quote: Number(liquidityQuote.toFixed(6)),
        },
        fdv: Number(fdv.toFixed(2)),
        marketCap: Number(marketCap.toFixed(2)),
        pairCreatedAt: token.system_created,
        participants,
        buySellVolume: buySellVolume_usd,
        holders: latest_holder_count,
        info: {
          imageUrl: imageUrl,
        },
      },
      message: null,
      statusCode: 200,
    });

  } catch (err) {
    console.error(err);
    return res.status(500).send(Response.sendResponse(false, null, "Error occurred", 500));
  }
};

// Helper function to fetch DexScreener data
// for tek we add a value and it searches only tek.
// here search would be the contract address
const fetchDexScreenerData = async (search, from = null) => {
  let url = ''
  if(from)
    url = `https://api.dexscreener.com/latest/dex/search?q=`
  else{
    url = `https://api.dexscreener.com/latest/dex/search?q=AVAX/ARENATRADE`;
  }
  if(search) 
    url = url + `/${search}`

  const response = await axiosInstance.get(url);
  const avalanchePairs = response.data.pairs.filter(pair => pair.dexId === "arenatrade");
  return avalanchePairs;
};

const fetchMultipleTokensDexScreener = async (tokens) => {
  const response = await axiosInstance.get(`https://api.dexscreener.com/tokens/v1/avalanche/`+tokens);
  return response;
}

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
            const avalanchePairs = await fetchDexScreenerData(search, "contract_address");
            const formatted = convertDexDataToCustomFormat(avalanchePairs);
            await redisClient.set(cacheKey, JSON.stringify(formatted), { EX: 3600 });
            return res.status(200).send(Response.sendResponse(true, [formatted[0]], null, 200));
          }
        } else {
          let query = `
          SELECT 
          atc.pair_address, 
          atc.contract_address, 
          atc.supply, 
          atc.internal_id, 
          atc.lp_deployed, 
          atc.name,
          atc.symbol,
          
          -- Add photo_url from token_metadata
          tm.photo_url,

          -- Supply calculation in WEI
          SUM(CASE WHEN at.action = 'initial buy' THEN CAST(at.amount AS NUMERIC) ELSE 0 END) +
          SUM(CASE WHEN at.action = 'buy' THEN CAST(at.amount AS NUMERIC) ELSE 0 END) -
          SUM(CASE WHEN at.action = 'sell' THEN CAST(at.amount AS NUMERIC) ELSE 0 END) AS latest_supply_wei,

          -- Latest price_after_usd from most recent trade
          (
            SELECT at2.price_after_usd
            FROM arena_trades at2
            WHERE at2.token_id = at.token_id AND at2.status = 'success'
            ORDER BY at2.timestamp DESC
            LIMIT 1
          ) AS latest_price_usd,

          -- MarketCap = supply in ETH * latest USD price
          (
            (
              SUM(CASE WHEN at.action = 'initial buy' THEN CAST(at.amount AS NUMERIC) ELSE 0 END) +
              SUM(CASE WHEN at.action = 'buy' THEN CAST(at.amount AS NUMERIC) ELSE 0 END) -
              SUM(CASE WHEN at.action = 'sell' THEN CAST(at.amount AS NUMERIC) ELSE 0 END)
            ) / 1e18
          ) *
          (
            SELECT at2.price_after_usd
            FROM arena_trades at2
            WHERE at2.token_id = at.token_id AND at2.status = 'success'
            ORDER BY at2.timestamp DESC
            LIMIT 1
          ) AS marketcap

      FROM arena_trades at
      LEFT JOIN "arena-trade-coins" atc ON at.token_id = atc.internal_id
      LEFT JOIN token_metadata tm ON atc.contract_address = tm.contract_address  -- Join added for photo_url
      WHERE LOWER(atc.contract_address) = LOWER(:contract_address) AND at.status = 'success'
      GROUP BY 
          atc.pair_address, 
          atc.contract_address, 
          atc.supply, 
          at.token_id, 
          atc.internal_id, 
          atc.lp_deployed, 
          atc.name, 
          atc.symbol, 
          tm.photo_url;  -- Include in GROUP BY
          `
          
          const dbTokensWithTrades = await db.sequelize.query(  
            query,
            {
              replacements: { contract_address: search },
              type: db.Sequelize.QueryTypes.SELECT,
            }
          );
          return res.status(200).send(Response.sendResponse(true, dbTokensWithTrades, null, 200));
        }
      }
    }

    // 🔹 If no search is provided 
    // Need tek at the top
    if (!search) {
      const cacheKey = `dex:search:${search?.toLowerCase()}`;
      const cached = await redisClient.get(cacheKey);
      const tekSearchContractAddress = '0x96f4a78c19a273d95fb082800911db66648b0670'.toLowerCase();
      const cachedTekToken = `dex:contract:${tekSearchContractAddress}`;
      const isTekCached = await redisClient.get(cachedTekToken)
      let formattedResponse;
      let tekResponse;
      if(isTekCached) {
        tekResponse = JSON.parse(isTekCached)
      }else{  

        const avalanchePairs = await fetchDexScreenerData(tekSearchContractAddress, 'tek');
        tekResponse = convertDexDataToCustomFormat(avalanchePairs);
        await redisClient.set(cachedTekToken, JSON.stringify(tekResponse), { EX: 3600 });
      }

      if (cached) {
        formattedResponse = JSON.parse(cached);
      } else {
        const avalanchePairs = await fetchDexScreenerData(search);
        let dexData = convertDexDataToCustomFormat(avalanchePairs);
        // remove Tek if there in the array => do not want duplicate entry
        formattedResponse = dexData.filter(el => el.contract_address.toLowerCase() !== '0x96f4a78c19a273d95fb082800911db66648b0670'.toLowerCase())
        await redisClient.set(cacheKey, JSON.stringify(formattedResponse), { EX: 3600 });
      }

      return res.status(200).send(Response.sendResponse(true, [...tekResponse,...formattedResponse], null, 200));
    }

    // 🔹 If search is short (e.g., symbol like "usdt")
    if (search?.length <= 2) {
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


    // this is when searched
    let query = `
        SELECT 
            c.internal_id,
            c.name,
            c.symbol,
            c.lp_deployed,
            c.pair_address,
            c.contract_address,
            (COALESCE(t.price_after_usd, 0) * 10000000000) AS marketCap,
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
        WHERE c.name ILIKE :search OR c.symbol ILIKE :search
        ORDER BY 
        c.lp_deployed DESC, 
        marketCap DESC
        LIMIT 10;
    `


    // 🔹 Name or symbol match from DB
    const dbTokens = await db.sequelize.query(
      query,
      {
        replacements: { search: `${search}%` },
        type: db.Sequelize.QueryTypes.SELECT,
      }
    );

    if (dbTokens.length > 0) {
      const lpDeployedTrueTokens = dbTokens.filter(el => el.lp_deployed);
      const lpDeployedFalseTokens = dbTokens.filter(el => !el.lp_deployed);
      let multipleTokensFormattedResponse = [];
      if(lpDeployedTrueTokens.length) {
        const tokenContractAddresses = lpDeployedTrueTokens.map(token => token.contract_address).join(',')
        let multipleTokensResponse = await fetchMultipleTokensDexScreener(tokenContractAddresses)
        multipleTokensFormattedResponse = convertDexDataToCustomFormat(multipleTokensResponse.data);
      }

      // here the logic for the no lptokens
      const currentAvaxPrice = await getLastestAvaxPrice();


      for(let i = 0; i < lpDeployedFalseTokens.length; i++) {
        const response = await db.sequelize.query(`SELECT price_after_eth,avax_price from public.arena_trades where token_id = ${lpDeployedFalseTokens[i].internal_id} order by timestamp DESC, absolute_tx_position DESC LIMIT 1`,
        { type: db.sequelize.QueryTypes.SELECT })


        const latest_price_usd = parseFloat(response[0]?.price_after_eth) * parseFloat(response[0].avax_price);

        const volume = await getSumOfTotalBuyAndSell(db.sequelize, lpDeployedFalseTokens[i].internal_id)


        if(((volume[0].total_buy - volume[0].total_sell) == 0 || volume[0].total_buy - volume[0].total_sell < 0) && volume[0].total_sell != 0) {
          console.log("token is thoop")
          lpDeployedFalseTokens[i].marketcap = '0'
          continue;
        }

        const latest_supply_wei = volume[0].total_buy - volume[0].total_sell;
        const latest_supply_eth = Number(latest_supply_wei) / 1e18;


        lpDeployedFalseTokens[i].latest_price_usd =  Number(latest_price_usd.toFixed(12));
        lpDeployedFalseTokens[i].latest_supply_eth =  Number(latest_supply_eth.toFixed(6));
        // took Frontend formula
        lpDeployedFalseTokens[i].marketcap =  Number(latest_supply_eth.toFixed(6)) *  Number(latest_price_usd.toFixed(12)) 

      }

      let sorted = [...multipleTokensFormattedResponse,...lpDeployedFalseTokens].sort((a,b) => b.marketcap - a.marketcap)


      return res.status(200).send(Response.sendResponse(true, sorted, null, 200));
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

    if (!pair_address) {
      return res.status(400).send(Response.sendResponse(false, null, "Contract address is required", 400));
    }

    // 1. Get Token Info
    const tokenInfo = await db.sequelize.query(
      `
        SELECT internal_id, contract_address
        FROM "arena-trade-coins"
        WHERE LOWER(pair_address) = LOWER(:pair_address)
        LIMIT 1
      `,
      {
        replacements: { pair_address },
        type: db.Sequelize.QueryTypes.SELECT,
      }
    );

    if (!tokenInfo.length) {
      return res.status(404).send(Response.sendResponse(false, null, "Token not found", 404));
    }

    const tokenId = tokenInfo[0].internal_id;
    const contractAddress = tokenInfo[0].contract_address;

    // 2. Get USD Price from DB
    const priceResult = await db.sequelize.query(
      `
        SELECT price_after_usd
        FROM arena_trades
        WHERE token_id = :tokenId AND status = 'success'
        ORDER BY timestamp DESC
        LIMIT 1
      `,
      {
        replacements: { tokenId },
        type: db.Sequelize.QueryTypes.SELECT,
      }
    );

    const priceUsd = priceResult.length ? parseFloat(priceResult[0].price_after_usd) : 0;

    // 3. Get All Addresses From DB Trades
    const rawHolders = await db.sequelize.query(
      `
        SELECT DISTINCT LOWER(from_address) AS address
        FROM arena_trades
        WHERE token_id = :tokenId
      `,
      {
        replacements: { tokenId },
        type: db.Sequelize.QueryTypes.SELECT,
      }
    );

    // 4. Fetch On-Chain Data Using Ethers
    const provider = new ethers.JsonRpcProvider("https://api.avax.network/ext/bc/C/rpc");
    const contract = new ethers.Contract(contractAddress, ERC20_ABI, provider);

    const [totalSupplyRaw, decimals] = await Promise.all([
      contract.totalSupply(),
      contract.decimals()
    ]);
    const totalSupply = ethers.formatUnits(totalSupplyRaw, decimals);

    const holders = [];

    for (const { address } of rawHolders) {
      const balanceRaw = await contract.balanceOf(address);
      const balance = ethers.formatUnits(balanceRaw, decimals);
      const balanceNum = parseFloat(balance);

      if (balanceNum > 0) {
        const usdValue = priceUsd * balanceNum;
        const percentSupply = (balanceNum / parseFloat(totalSupply)) * 100;

        holders.push({
          address,
          balance: balanceNum.toLocaleString("en-US"),
          usd_value: `$${usdValue.toFixed(6)}`,
          percent_supply: `${percentSupply.toFixed(4)}%`,
        });
      }
    }

    // 5. Sort by Balance Desc
    holders.sort((a, b) => parseFloat(b.balance.replace(/,/g, '')) - parseFloat(a.balance.replace(/,/g, '')));

    const ranked = holders.map((holder, index) => ({ ...holder, rank: index + 1 }));

    return res.status(200).send(Response.sendResponse(true, { holders: ranked }, "Holders Data", 200));

  } catch (err) {
    console.error("holdersTokens error:", err);
    return res.status(500).send(Response.sendResponse(false, null, "Internal Server Error", 500));
  }
};

const transactionBuySellHistory = async (req, res) => {
  try {
    const { pair_address } = req.params;
    const limit = Number(req.query.limit) || 10;
    const offset = Number(req.query.offset) || 0;
        
    if (!pair_address) {
      return res.status(400).send(
        Response.sendResponse(false, null, "Pair address is required", 400)
      );
    }

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

    if (!walletDataList || walletDataList.length === 0) {
      return res.status(400).send(
        Response.sendResponse(false, null, "Pair address not found", 400)
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
      WHERE LOWER(atc.contract_address) = LOWER(:contract_address) AND at.status = 'success'
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

const liquidityStatus = async(req,res) => {
  try{
    let { pair_address } = req.params;
    const response = await db.sequelize.query(
      `SELECT lp_deployed FROM "arena-trade-coins" WHERE LOWER(pair_address) = LOWER(:pair_address)`,
      {
        replacements: { pair_address: pair_address.toLowerCase() },
        type: db.Sequelize.QueryTypes.SELECT,
      }
    );
    return res.status(200).send(Response.sendResponse(true, response, null, 200));
  }catch(err){
    return res.status(500).send(Response.sendResponse(false, null, "Error occurred", 500));
  }
}

const getTradeChangePercentage = async (req, res) => {
  try {
    const { contract_address, time } = req.query;
    if (!contract_address) {
      return res.status(400).send(Response.sendResponse(false, null, "Missing contract_address parameter", 400));
    }
    // Support both hours (e.g., '24') and minutes (e.g., '5m')
    let intervalStr = "24 hours";
    if (time) {
      if (typeof time === 'string' && time.endsWith('m')) {
        const minutes = parseInt(time.slice(0, -1));
        if (!isNaN(minutes) && minutes > 0) {
          intervalStr = `${minutes} minutes`;
        }
      } else {
        const hours = parseInt(time.slice(0, -1))
        if (!isNaN(hours) && hours > 0) {
          intervalStr = `${hours} hours`;
        }
      }
    }

    // Get token_id from contract_address (case-insensitive)
    const tokenRow = await db.ArenaTradeCoins.findOne({
      where: db.Sequelize.where(
        db.Sequelize.fn('lower', db.Sequelize.col('contract_address')),
        contract_address.toLowerCase()
      ),
      attributes: ['internal_id'],
    });
    if (!tokenRow) {
      return res.status(404).send(Response.sendResponse(false, null, `No token found for contract_address: ${contract_address}`, 404));
    }
    const token_id = tokenRow.internal_id;

    // Run the price change query (using price_eth)
    const query = `
      WITH price_data AS (
        SELECT
          token_id,
          FIRST_VALUE(price_eth) OVER (PARTITION BY token_id ORDER BY timestamp ASC) AS old_price,
          LAST_VALUE(price_eth) OVER (PARTITION BY token_id ORDER BY timestamp ASC
                                      ROWS BETWEEN UNBOUNDED PRECEDING AND UNBOUNDED FOLLOWING) AS new_price
        FROM arena_trades
        WHERE timestamp >= NOW() - INTERVAL '${intervalStr}'
          AND price_eth IS NOT NULL AND token_id = :token_id AND status = 'success'
      )
      SELECT
        token_id,
        ROUND(((new_price - old_price) / NULLIF(old_price, 0)) * 100, 2) AS price_change_percent
      FROM price_data
      GROUP BY token_id, old_price, new_price
      ORDER BY price_change_percent DESC;
    `;
    const result = await db.sequelize.query(query, {
      replacements: { token_id },
      type: db.Sequelize.QueryTypes.SELECT,
    });
    if (!result || result.length === 0) {
      return res.status(200).send(Response.sendResponse(false, null, {token_id, price_change_percent: "0"}, 404));
    }
    return res.status(200).send(Response.sendResponse(true, result[0], null, 200));
  } catch (err) {
    console.error('Error in getTradeChangePercentage:', err);
    return res.status(500).send(Response.sendResponse(false, null, "Error occurred", 500));
  }
}


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
  tokenListTokensMerged,
  liquidityStatus,
  getTradeChangePercentage
}