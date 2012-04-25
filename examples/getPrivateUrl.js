var cloudfront = require('..');

var cf = cloudfront.createClient(process.env.AWS_KEY, process.env.AWS_SECRET);

cf.keyPairId = process.env.AWS_CF_KEY_PAIR_ID;
cf.privateKey = process.env.AWS_CF_PRIVATE_KEY;

var argv = process.argv.slice(2);
console.log( cf.getPrivateUrl.apply(cf, argv) );
