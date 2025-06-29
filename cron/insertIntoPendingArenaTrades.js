const db = require("../config/db.config");
const { calculatePriceEtherForSubsequentTransactions } = require('../utils/calculatingPriceEth');

async function findInitialBuys() {
  try {
    console.log('Searching for temp trades and matching initial buys...');
    
    // First, get all records from arena_trades_temp sorted by timestamp ASC
    const tempTrades = await db.ArenaTradeTemp.findAll({
      order: [['timestamp', 'ASC']]
    });

    console.log(`Found ${tempTrades.length} temp trades (sorted by timestamp ASC):`);
    
    // For each temp trade, find matching initial buy in arena_trades
    for (const tempTrade of tempTrades) {
      console.log(`\n--- Processing Temp Trade ---`);
      
      const matchingInitialBuy = await db.ArenaTrade.findOne({
        where: {
          token_id: tempTrade.token_id,
          action: 'initial buy',
          status: 'success'
        },
        attributes: ['id', 'price_eth', 'price_after_eth', 'price_usd', 'price_after_usd', 'amount'],
        order: [['timestamp', 'ASC']]
      });

      console.log(matchingInitialBuy)

      if (!matchingInitialBuy) {
        continue;
      }
      
      console.log(`Found matching initial buy for token_id ${tempTrade.token_id}:`);

      // Call the calculation function with the initial buy data
      const calculatedPrices = await calculatePriceEtherForSubsequentTransactions(
        tempTrade.token_id,
        tempTrade.amount,
        tempTrade.avax_price,
        tempTrade.transferred_avax,
        matchingInitialBuy
      );

      if (calculatedPrices) {
        console.log(`  Price ETH: ${calculatedPrices.price_eth}`);
        console.log(`  Price USD: ${calculatedPrices.price_usd}`);
        console.log(`  Price After ETH: ${calculatedPrices.price_after_eth}`);
        console.log(`  Price After USD: ${calculatedPrices.price_after_usd}`);

        // Create object for arena_trades insertion
        const arenaTradeData = {
          transferred_avax: tempTrade.transferred_avax,
          avax_price: tempTrade.avax_price,
          price_eth: calculatedPrices.price_eth,
          price_usd: calculatedPrices.price_usd,
          price_after_usd: calculatedPrices.price_after_usd,
          price_after_eth: calculatedPrices.price_after_eth,
          block_number: tempTrade.block_number,
          timestamp: tempTrade.timestamp,
          token_id: tempTrade.token_id,
          action: tempTrade.action,
          tx_hash: tempTrade.tx_hash,
          from_address: tempTrade.from_address,
          referrer: tempTrade.referrer,
          status: tempTrade.status,
          amount: tempTrade.amount,
          tx_index: tempTrade.tx_index,
          log_index: tempTrade.log_index,
          absolute_tx_position: tempTrade.absolute_tx_position,
          tx_id: tempTrade.tx_id
        };

        // Insert into arena_trades table
        try {
          const insertedTrade = await db.ArenaTrade.create(arenaTradeData);

          // Delete from temp table after successful insertion
          try {
            await db.ArenaTradeTemp.destroy({
              where: { id: tempTrade.id }
            });
          } catch (deleteError) {
            console.error(`  Error deleting from arena_trades_temp:`, deleteError);
          }
        } catch (insertError) {
          console.error(`\n  Error inserting into arena_trades:`, insertError);
        }
      } else {
        console.log(`\n  Failed to calculate prices for token_id ${tempTrade.token_id}`);
      }
    }

    if (tempTrades.length === 0) {
      console.log('No temp trades found.');
    }

  } catch (error) {
    console.error('Error searching for temp trades and initial buys:', error);
  }
}

// Schedule the function to run every second
const intervalId = setInterval(async () => {
  console.log('\n=== Starting scheduled job ===');
  await findInitialBuys();
  console.log('=== Job completed ===\n');
}, 1000); // 1000ms = 1 second

console.log('Job scheduled to run every second');
console.log('Press Ctrl+C to stop the job');

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\nStopping job...');
  clearInterval(intervalId);
  process.exit(0);
});

module.exports = {
  findInitialBuys,
  intervalId
}; 