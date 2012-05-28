var cloudfront = require('..')
  , inspect = require('eyes').inspector({maxLength: -1})

var cf = cloudfront.createClient(process.env.AWS_KEY, process.env.AWS_SECRET);

cf.getDistribution(process.argv[2], function(err, dist) {
  if (err) throw err;

  inspect(dist)
});
