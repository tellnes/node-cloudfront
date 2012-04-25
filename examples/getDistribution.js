var util = require('util');
var cloudfront = require('..');

var cf = cloudfront.createClient(process.env.AWS_KEY, process.env.AWS_SECRET);

cf.getDistribution(process.argv[2], function(err, dist) {
  if (err) throw err;

  console.log(util.inspect(dist, false, 3, true));
});
