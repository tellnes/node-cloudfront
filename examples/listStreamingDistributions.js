var cloudfront = require('..');

var cf = cloudfront.createClient(process.env.AWS_KEY, process.env.AWS_SECRET);

cf.listStreamingDistributions(function(err, list, info) {
  if (err) {
    console.error(err);
  } else {
    console.log(list);
  }
});
