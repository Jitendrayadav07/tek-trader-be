const db = require("../config/db.config");
const { Op } = require("sequelize");
const axios = require('axios');

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

const BATCH_SIZE = 50;
const START_ID = 1;
const END_ID = 10372;

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const ethToWei = (eth) => {
  return BigInt(Math.abs(eth) * 1e18).toString();
};

const processSingleToken = async (token) => {
  const internal_id = token.internal_id;
  const contract_address = token.contract_address.toLowerCase();

  let insertCount = 0;
  let updateCount = 0;

  try {
    console.log(`\n🚀 Starting token ID: ${internal_id} | contract: ${contract_address}`);

    const dbTrades = await db.ArenaTrade.findAll({
      where: { token_id: internal_id, status: 'success' }
    });

    const dbHashMap = {};
    for (let i = 0; i < dbTrades.length; i++) {
      dbHashMap[dbTrades[i].tx_hash] = dbTrades[i];
    }

    let allApiTxs = [];
    let offset = 0;
    const limit = 1000;
    let hasMore = true;

    while (hasMore) {
      const apiUrl = `https://api.arenapro.io/token_trades_view?token_contract_address=eq.${contract_address}&order=absolute_order.desc&limit=${limit}&offset=${offset}`;
      const response = await axiosInstance.get(apiUrl);
      const data = response.data;
 
      if (data.length < limit) hasMore = false;
      else offset += limit;

      allApiTxs = allApiTxs.concat(data);
    }

    for (let j = 0; j < allApiTxs.length; j++) {
      const apiTx = allApiTxs[j];
      const txHash = apiTx.transaction_hash;
      const dbTrade = dbHashMap[txHash];

      if (!dbTrade) {

        const alreadyExists = await db.ArenaTrade.findOne({
          where: { tx_hash: txHash },
          attributes: ['tx_hash']
        });
      
        if (alreadyExists) {
          console.log(`⏭️ Skipped existing tx_hash: ${txHash}`);
          continue;
        }
        const newTrade = {
          transferred_avax: Math.abs(Number(apiTx.user_eth)),
          avax_price: apiTx.avax_price,
          block_number: apiTx.block_number,
          timestamp: new Date(apiTx.create_time * 1000),
          token_id: internal_id,
          action: apiTx.token_eth < 0 ? 'sell' : 'buy',
          tx_hash: txHash,
          from_address: apiTx.user_address,
          referrer: null,
          status: 'success',
          amount: ethToWei(apiTx.token_eth),
          tx_index: apiTx.transaction_idx,
          log_index: apiTx.log_idx,
          absolute_tx_position: apiTx.absolute_order,
          tx_id: `${apiTx.block_number}_${apiTx.transaction_idx}_${apiTx.log_idx}`
        };

        await db.ArenaTrade.create(newTrade);
        console.log(`🟢 Inserted tx_hash: ${txHash}`);
        insertCount++;
      } else {
        const shouldUpdate =
          dbTrade.tx_index !== apiTx.transaction_idx ||
          dbTrade.log_index !== apiTx.log_idx ||
          String(dbTrade.absolute_tx_position) !== String(apiTx.absolute_order);

        if (shouldUpdate) {
          await db.ArenaTrade.update({
            avax_price: apiTx.avax_price,
            tx_index: apiTx.transaction_idx,
            log_index: apiTx.log_idx,
            absolute_tx_position: apiTx.absolute_order,
          }, {
            where: { tx_hash: txHash }
          });
          console.log(`🟡 Updated tx_hash: ${txHash}`);
          updateCount++;
        }
      }
    }

    console.log(`✅ Finished token ID ${internal_id} | Inserted: ${insertCount} | Updated: ${updateCount}`);
  } catch (err) {
    console.error(`❌ Failed token ID ${internal_id}:`, err.message);
  }
};

const runBatchJob = async () => {
  for (let startId = START_ID; startId <= END_ID; startId += BATCH_SIZE) {
    const endId = Math.min(startId + BATCH_SIZE - 1, END_ID);

    const batchTokens = await db.ArenaTradeCoins.findAll({
      where: {
        internal_id: {
          [Op.gte]: startId,
          [Op.lte]: endId
        },
        contract_address: { [Op.ne]: null },
        lp_deployed : false,
      },
      attributes: ['internal_id', 'contract_address']
    });

    console.log(`🔄 Processing batch: ${startId} to ${endId} (${batchTokens.length} tokens)`);

    for (const token of batchTokens) {
      await processSingleToken(token);
      await delay(300); // Optional: avoid API rate-limiting
    }

    console.log(`✅ Finished batch ${startId} to ${endId}`);
    await delay(2000); // Optional: cool down between batches
  }

  console.log("🎉 All tokens processed");
};

runBatchJob();
