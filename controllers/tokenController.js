const axios = require('axios');
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

const tokenListTokens = async (req, res) => {
  try {
    let { search, wallet_address } = req.query;
    if (wallet_address && search) {
      // Fetch community data
      const communities = await fetchStarsArenaCommunities(search);
      let response = formatCommunityData(communities);

      // Fetch balance data from Glacier API
      const { data } = await axios.get(
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
        // Fetch matching tokens from database
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

        const dbTokenMap = new Map(dbTokens.map(t => [t.contract_address.toLowerCase(), t]));
        const balanceMap = new Map(
          tokensWithBalance.map(t => [
            t.address.toLowerCase(),
            parseFloat(t.balance) / 10 ** t.decimals
          ])
        );

        // Add balance to community data
        response = response.map(community => ({
          ...community,
          balance: balanceMap.get(community.contract_address.toLowerCase()) || 0
        }));
      }

      return res.status(200).send({ isSuccess: true, result: response, message: null, statusCode: 200 });
    } else if (wallet_address) {
      // Fetch balance data from Glacier API
      const { data } = await axios.get(
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

      if (tokenAddresses.length === 0) {
        return res.status(200).send({ isSuccess: true, result: [], message: null, statusCode: 200 });
      }

      // Fetch matching tokens from database to get lp_deployed status
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

      const dbTokenMap = new Map(dbTokens.map(t => [t.contract_address.toLowerCase(), t]));

      // Sort tokens by lp_deployed (true first) and then by balance (descending)
      const topTokens = tokensWithBalance
        .map(t => ({
          address: t.address.toLowerCase(),
          balance: parseFloat(t.balance) / 10 ** t.decimals,
          decimals: t.decimals,
          name: t.name,
          symbol: t.symbol,
          logoUri: t.logoUri,
          lp_deployed: dbTokenMap.get(t.address.toLowerCase())?.lp_deployed || false
        }))
        .sort((a, b) => {
          if (a.lp_deployed === b.lp_deployed) {
            return b.balance - a.balance; // Same lp_deployed status, sort by balance
          }
          return a.lp_deployed ? -1 : 1; // true lp_deployed comes first
        })
        .slice(0, 5);

      const topTokenAddresses = topTokens.map(t => t.address);

      // Fetch community data for each token address individually
      let communities = [];
      for (const address of topTokenAddresses) {
        try {
          const communityData = await fetchStarsArenaCommunities(address);
          communities = communities.concat(communityData);
        } catch (error) {
          console.error(`Error fetching community for address ${address}:`, error);
        }
      }

      let response = formatCommunityData(communities);

      // Create balance map for top tokens
      const balanceMap = new Map(
        topTokens.map(t => [t.address, t.balance])
      );

      // Merge community data with balance and database info
      response = response.map(community => {
        const match = dbTokenMap.get(community.contract_address.toLowerCase());
        if (!match) return null;
        return {
          ...community,
          name: match.name || community.name,
          symbol: match.symbol || community.symbol,
          lp_deployed: match.lp_deployed || community.lp_deployed,
          pair_address: match.pair_address || community.pair_address,
          balance: balanceMap.get(community.contract_address.toLowerCase()) || 0
        };
      }).filter(Boolean);

      return res.status(200).send({ isSuccess: true, result: response, message: null, statusCode: 200 });
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

const communitiesListOfTokenController = async (req, res) => {
  try {
    const { search } = req.query;

    if (!search) {
      return res.status(400).send({isSuccess: false,result: null,message: "Missing search query parameter",statusCode: 400});
    }

    const communities = await fetchStarsArenaCommunities(search);
    const response = formatCommunityData(communities);

    return res.status(200).send({isSuccess: true,result: response,message: null,statusCode: 200});
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
  walletHoldings
}