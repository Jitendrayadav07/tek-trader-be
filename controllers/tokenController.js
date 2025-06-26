const axios = require('axios');
const Response = require("../classes/Response");
const db = require("../config/db.config");
const DexScreenerService = require('../classes/pairAddress');
const { Op, QueryTypes, where } = require("sequelize");


const recentTokens = async (req, res) => {
    try {
      const limit = parseInt(req.query.limit) || 10;
      const offset = parseInt(req.query.offset) || 0;
  
      const tokens = await db.token.findAll({
        where: {
          internal_id: 78621
        },
        order: [["internal_id", "DESC"]],
        limit,
        offset,
      });
  
      const tokenIds = tokens.map((t) => t.internal_id);
  
      const trades = await db.trade.findAll({
        where: {
          token_id: {
            [Op.in]: tokenIds,
          },
        },
        order: [["id", "ASC"]],
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
  
          const latestTrade = tokenTrades[tokenTrades.length - 1] || null;
  
          const latest_trade_absolute_order = latestTrade?.id || null;
  
          const latest_price_eth = latestTrade?.price
            ? parseFloat(latestTrade.price) / 1e18
            : 0;
  
          const latest_price_usd = latest_price_eth * avax_price;
  
          const latest_total_volume_eth = tokenTrades.reduce(
            (sum, t) => sum + parseFloat(t.amount || 0) / 1e18,
            0
          );
  
          const latest_total_volume_usd =
            latest_total_volume_eth * avax_price;
  
          const latest_transaction_count = tokenTrades.length;
  
          const latest_holder_count = new Set(
            tokenTrades.map((t) => t.from_address)
          ).size;
  
          const tokens_by_creator = await db.token.count({
            where: { creator_address: token.creator_address },
          });
  
          const initialBuyAmount = tokenTrades
            .filter((t) => t.action === "initial buy")
            .reduce((sum, t) => sum + parseFloat(t.amount || 0), 0);
  
          const totalBuyAmount = tokenTrades
            .filter((t) => t.action === "buy")
            .reduce((sum, t) => sum + parseFloat(t.amount || 0), 0);
  
          const totalSellAmount = tokenTrades
            .filter((t) => t.action === "sell")
            .reduce((sum, t) => sum + parseFloat(t.amount || 0), 0);
  
          const latest_supply_eth =
            (initialBuyAmount + totalBuyAmount - totalSellAmount) / 1e18;
  
          const tokenMetadata = await db.tokenMetadata.findOne({
            where: { bc_group_id: token.internal_id },
          });
  
          return {
            row_id: token.id,
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
            creator_twitter_handle: tokenMetadata?.owner_twitter_handle || null,
            creator_twitter_pfp_url:
              tokenMetadata?.owner_twitter_picture || null,
            latest_trade_absolute_order,
            latest_price_eth: Number(latest_price_eth.toFixed(12)),
            latest_avax_price: Number(avax_price.toFixed(12)),
            latest_price_usd: Number(latest_price_usd.toFixed(12)),
            latest_total_volume_eth: Number(
              latest_total_volume_eth.toFixed(6)
            ),
            latest_total_volume_usd: Number(
              latest_total_volume_usd.toFixed(6)
            ),
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
  
      return res
        .status(200)
        .send(Response.sendResponse(true, { offset, limit, items: responseList }, null, 200));
    } catch (err) {
      console.error("Error fetching recent tokens:", err);
      return res
        .status(500)
        .send(Response.sendResponse(false, null, "Error occurred", 500));
    }
};

const pairTokenData =  async (req, res) => {
    try{
     const { pairId } = req.params;
     const url = `https://api.dexscreener.com/latest/dex/pairs/avalanche/${pairId}`;
 
     const response = await axios.get(url);
     return res.status(200).send(Response.sendResponse(true,response.data.pair,null,200));
    }catch(err){
     console.error("Error fetching token list:", err);
     return res.status(500).send(Response.sendResponse(false, null, "Error occurred", 500));
    }
}

const tokenListTokens = async (req, res) => {
    try {
      let { count, offset, search, sortBy, orderBy } = req.query;
      count = Number(count) || 10;
      offset = Number(offset) || 0;
      let search_key = ``;
      if (search) {
        // Check if search input looks like a contract address (starts with 0x and 40 hex chars)
        const isAddress = /^0x[a-fA-F0-9]{40}$/.test(search.trim());
      
        if (isAddress) {
          search_key = `AND LOWER(atc.pair_address) = LOWER(:search)`;
        } else {
          search_key = `AND (atc.symbol ILIKE :search OR atc.name ILIKE :search)`;
        }
      }
  
      // Whitelist allowed fields for sorting to prevent SQL injection
      const allowedSortFields = ['pair_address', 'symbol', 'name', 'id'];
      const allowedOrderDirections = ['ASC', 'DESC'];
  
      // Fallbacks and sanitization
      sortBy = allowedSortFields.includes(sortBy) ? sortBy : 'id';
      orderBy = allowedOrderDirections.includes((orderBy || '').toUpperCase()) ? orderBy.toUpperCase() : 'DESC';
  
      const order_key = `ORDER BY atc.${sortBy} ${orderBy}`;
  
      // 1. Count of distinct contract_address
      const countResult = await db.sequelize.query(
        `SELECT COUNT(*) as total FROM (
           SELECT DISTINCT ON (atc.contract_address) atc.contract_address 
           FROM "arena-trade-coins" AS atc
           LEFT JOIN token_metadata AS tm ON atc.contract_address = tm.contract_address
           WHERE 1=1 ${search_key}
           ORDER BY atc.contract_address, atc.id DESC
         ) AS subquery`,
        {
          replacements: search ? { search: `%${search}%` } : {},
          type: db.Sequelize.QueryTypes.SELECT,
        }
      );
      
      // 2. Fetch paginated data
      const token_data = await db.sequelize.query(
        `SELECT DISTINCT ON (atc.contract_address) 
           atc.id,
           atc.contract_address, 
           atc.symbol,
           atc.pair_address, 
           atc.name, 
           tm.photo_url AS photo_url
         FROM "arena-trade-coins" AS atc
         LEFT JOIN token_metadata AS tm ON atc.contract_address = tm.contract_address
         WHERE 1=1 ${search_key}
         ORDER BY atc.contract_address, atc.id DESC
         LIMIT :count OFFSET :offset`,
        {
          replacements: {
            ...(search ? { search: search.trim() } : {}),
            count,
            offset
          },
          type: db.Sequelize.QueryTypes.SELECT,
        }
      );
    
      // console.log("Token Data:", token_data);
  
      await Promise.all(token_data.map(async (token) => {
        if (token.pair_address) {
          const marketData = await DexScreenerService.fetchMarketData(token.pair_address);
          Object.assign(token, marketData);
        } else {
          Object.assign(token, {
            priceUsd: null,
            volume: null,
            priceChange: null,
            liquidity: null,
            fdv: null,
            marketCap: null
          });
        }
      }));
  
      token_data.sort((a, b) => {
        if (b.marketCap === null && a.marketCap === null) return 0;
        if (b.marketCap === null) return -1;
        if (a.marketCap === null) return 1;
        return b.marketCap - a.marketCap;
      });
  
      return res.status(200).send(
        Response.sendResponse(true, { token_data, length: countResult[0].total }, null, 200)
      );
  
    } catch (err) {
      console.error("Error fetching token list:", err);
      return res.status(500).send(Response.sendResponse(false, null, "Error occurred", 500));
    }
};

const getAllTokenlist = async (req, res) => {
  try {
    let { count, offset, search, sortBy, orderBy } = req.query;
   
    let search_key = ``;

    if (search) {
      search_key = `WHERE (atc.symbol LIKE :search OR atc.name ILIKE :search OR atc.creator_address ILIKE :search)`;
    } else {
        search_key = ``;
    }

    let order_key = ``
    if (sortBy && orderBy) {
        order_key = `ORDER BY atc.${sortBy} ${orderBy.toUpperCase()}`
    } else {
        order_key = ``
    }

    let token_data = await db.sequelize.query(
      `SELECT atc.symbol, atc.name , atc.creator_address , tm.photo_url FROM "arena-trade-coins" AS atc 
      LEFT JOIN "token_metadata" AS tm ON LOWER(tm.contract_address) = LOWER(atc.contract_address)
      ${search_key} ${order_key} LIMIT :count OFFSET :offset`, 
      {
        replacements: {
          search: `%${search}%`,  
          count: Number(count),
          offset: Number(offset)  
        }, 
        type: QueryTypes.SELECT 
      }
    )
    return res.status(200).send(Response.sendResponse(true, token_data, "Success"));
  } catch (err) {
    console.error("Error fetching token data by address:", err);
    return res.status(500).send(Response.sendResponse(false, null, "Error occurred", 500));
  }
};



module.exports = {
    recentTokens,
    pairTokenData,
    tokenListTokens,
    getAllTokenlist
}