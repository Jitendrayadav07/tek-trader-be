const redis = require('redis');

const redisClient = redis.createClient({
  url: process.env.REDIS_URL || 'redis://localhost:6379',
});

redisClient.on('error', (err) => console.error('❌ Redis Client Error', err));
redisClient.on('ready', () => console.log('🎯 Redis is ready'));

module.exports = redisClient;
