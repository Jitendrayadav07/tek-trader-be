const axios = require('axios');
const Response = require("../classes/Response");
const db = require("../config/db.config");
const DexScreenerService = require('../classes/pairAddress');
const { ethers } = require("ethers");
const { Op, QueryTypes, where } = require("sequelize");
const Web3 = require("web3");
const web3 = new Web3();

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

const pairTokenData =  async (req, res) => {
    try{
     const { pairId } = req.params;
     const url = `https://api.dexscreener.com/latest/dex/pairs/avalanche/${pairId}`;

     const response = await axios.get(url);
     return res.status(200).send(Response.sendResponse(true,response.data.pair,null,200));
    }catch(err){
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
      token : token_type,
      lp_deployed : token.lp_deployed,
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

const tokenListTokens = async (req, res) => {
  try {
    let { count, offset, search } = req.query;

    let search_key = '';
    let replacements = {
      count: Number(count),
      offset: Number(offset)
    };

    if (search) {
      const trimmedSearch = search.trim();
      const isAddress = /^0x[a-fA-F0-9]{40}$/.test(trimmedSearch);

      if (isAddress) {
        search_key = `AND (LOWER(atc.contract_address) = LOWER(:search) OR LOWER(atc.pair_address) = LOWER(:search))`;
        replacements.search = trimmedSearch;
      } else {
        search_key = `AND (atc.symbol ILIKE :search OR atc.name ILIKE :search)`;
        replacements.search = `%${trimmedSearch}%`;
      }
    }

    // Step 1: Get total count
    const token_count = await db.sequelize.query(
      `SELECT COUNT(*) AS total FROM "arena-trade-coins" AS atc
       LEFT JOIN token_metadata AS tm ON atc.contract_address = tm.contract_address
       WHERE 1=1 ${search_key}`,
      {
        replacements,
        type: db.Sequelize.QueryTypes.SELECT,
      }
    );

    // Step 2: Get token list
    const token_details = await db.sequelize.query(
      `SELECT atc.contract_address, atc.id, atc.lp_deployed ,atc.contract_address, atc.symbol, atc.lp_deployed, atc.pair_address, atc.name, atc.internal_id, atc.system_created, tm.photo_url AS photo_url
       FROM "arena-trade-coins" AS atc
       LEFT JOIN token_metadata AS tm ON atc.contract_address = tm.contract_address
       WHERE 1=1 ${search_key}
       ORDER BY atc.system_created DESC
       LIMIT :count OFFSET :offset`,
      {
        replacements,
        type: db.Sequelize.QueryTypes.SELECT,
      }
    );

    // Step 3: For each token, get extra data in parallel
    const token_data = await Promise.all(
      token_details.map(async (data) => {
        const url = `https://api.dexscreener.com/latest/dex/pairs/avalanche/${data.pair_address}`;

        try {
          const response = await axios.get(url);
          const pairInfo = response.data?.pair;
          if (pairInfo) {
            return {
              ...data,
              priceUsd: pairInfo?.priceUsd,
              volume: pairInfo?.volume,
              priceChange: pairInfo?.priceChange,
              liquidity: pairInfo?.liquidity,
              fdv: pairInfo?.fdv,
              marketCap: pairInfo?.marketCap
            };
          }
        } catch (err) {
          console.error(`Dexscreener error for pair_address ${data.pair_address}:`, err.message);
        }

        const transferredResult = await db.sequelize.query(
          `SELECT COALESCE(SUM(CAST(transferred_avax AS NUMERIC)), 0) AS total_transferred_avax
           FROM "arena_trades"
           WHERE token_id = :token_id`,
          {
            replacements: { token_id: data.internal_id },
            type: db.Sequelize.QueryTypes.SELECT,
          }
        );

        const latestPriceResult = await db.sequelize.query(
          `SELECT avax_price
           FROM "arena_trades"
           WHERE token_id = :token_id
           ORDER BY timestamp DESC
           LIMIT 1`,
          {
            replacements: { token_id: data.internal_id },
            type: db.Sequelize.QueryTypes.SELECT,
          }
        );

        const totalTransferredAvax = Number(transferredResult[0].total_transferred_avax);
        const latestAvaxPrice = Number(latestPriceResult[0]?.avax_price || 0);
        const latest_total_volume_usd = totalTransferredAvax * latestAvaxPrice;

        return {
          ...data,
          priceUsd: null,
          volume: latest_total_volume_usd || 0,
          priceChange: null,
          liquidity: null,
          fdv: null,
          marketCap: null
        };
      })
    );

    return res
      .status(200)
      .send(Response.sendResponse(true, { token_data, length: Number(token_count[0].total) }, null, 200));
  } catch (err) {
  
    return res.status(500).send(Response.sendResponse(false, null, 'Error occurred', 500));
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
        replacements: { pair_address: pair_address  , limit: Number(limit) || 10, offset: Number(offset) || 0 },
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

    return res.status(200).send(Response.sendResponse(true, {response}, "Holders Data", 200));
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
    if(!contract_address){
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
    const response = await axios.get(
      'https://api.starsarena.com/communities/top',
      {
        headers: {
          'Authorization': `Bearer eyJhbGciOiJSUzUxMiIsInR5cCI6IkpXVCJ9.eyJ1c2VyIjp7ImlkIjoiZmFiN2Q5ZjEtNWRlZC00N2YyLWI2NTEtM2Q3YmY4ZGNhZjgxIiwidHdpdHRlcklkIjoiNzk2MjQ0Nzg2OTQwNDE2MDAxIiwidHdpdHRlckhhbmRsZSI6ImFzaHVfY2hpa2FuZSIsInR3aXR0ZXJOYW1lIjoiQXNoaXNoIENoaWthbmXwn5S6IiwidHdpdHRlclBpY3R1cmUiOiJodHRwczovL3N0YXRpYy5zdGFyc2FyZW5hLmNvbS91cGxvYWRzLzkwZTc5ZWE3LTNhMDMtZjMxMi0yY2Y5LWNhYmI4OGMzY2Y1NDE3Mjk0ODQ0OTU4MzcucG5nIiwiYWRkcmVzcyI6IjB4ZDUyNjczZjQ2MjBkNzhiOGVhZmI5NTg1OTM1NzIzNjFiY2I2MzAzOCJ9LCJpYXQiOjE3NDk0NDMwNDMsImV4cCI6MTc1ODA4MzA0M30.SzALMP6gjisWvBAeoRcYLsP1wIKmzsyiN3hPxN0b7AfSGaj3GhIk2ZxV2Z0U14mQGfZ_vwHNbuiUp51ATZ0kb0X9TltGI0Ih1pwv-Bdid5-pzXZWO5Xvw0mFa3tOaFklukYF2mqD8blacxlng9n6IlNYhAVIEYxrTu33Bx9onulYwez88PFxAj7X3dBlLNyEMEu-vyahEVjaFHH4Fe4oaMHEXawRsLXz1j-nH64lY79RBwxC-1TwiYslfedrJ8zZ02WAFRdI8CgGzoOj9kD6mgznLXjDcKh5u5tRwsC3u6YpsvxwhWGZA7sGngsrYEpYYVFJAuBlFfA88BOwfRUdsGFCyCwHA8WZP_B-xZBqTpm_gKwtPo--cE9VxZjZxzSS1-8NKru6APCiJPQchZdJSTsDQVgdC_qtqrEufI_orU0sUuIQ0NzPe6yDk9nT8B6OvVL84OTau1XouRCvP4FR8gCtjm6dCWSmPfWytljXl867wrQkePTvtz-1SU5fjMcrm5hfbLiXl2NCa3SQhbQMZCeKCifBqfD9qvkVteT0LM728_0QK4E0iDWuOf7D5Pf2B7_RRn5PJn7WFJVJydOkyBB1tvUYHc_rR5RUoNoQtT84vwoX_w47FmdW3YtVJRf3fqJ3S_B5aVtBYr36DjupF7gRUs0aGqa8wGzO8fptBT0`
        }
      }
    );
    return res.status(200).send({
      isSuccess: true,
      result: response.data,
      message: null,
      statusCode: 200
    });
  } catch (err) {
    return res.status(500).send(Response.sendResponse(false, null, "Error occurred", 500));
  }
};

const getInternalIdByPairAddressData = async (req,res) => {
  try {
     let { pair_address } = req.params;
    const response = await db.sequelize.query(
      `SELECT internal_id FROM "arena-trade-coins" WHERE LOWER(pair_address) = LOWER(:pair_address)`,
      {
        replacements: { pair_address: pair_address.toLowerCase() },
        type: db.Sequelize.QueryTypes.SELECT,
      }
    );
    return res.status(200).send(Response.sendResponse(true,response,null,200));
  } catch (err) {
    return res.status(500).send(Response.sendResponse(false,null,"Error fetching internal ID by pair address:",500));
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
    holdersTokens,
    getInternalIdByPairAddressData
}