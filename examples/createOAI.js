var cloudfront = require('..');

var cf = cloudfront.createClient(process.env.AWS_KEY, process.env.AWS_SECRET);

cf.createOAI(process.argv[2], process.argv[3], function(err, oai) {
  if (err) {
    console.error(err);
  } else {
    console.log(oai);
  }
});
