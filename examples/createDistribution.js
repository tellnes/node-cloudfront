var cloudfront = require('..');

var cf = cloudfront.createClient(process.env.AWS_KEY, process.env.AWS_SECRET);

var config = {
  originType: 'custom',
  originDNSName: 'origin.example.com',
  originProtocolPolicy: 'http-only',

  cname: 'cdn.example.com',

  comment: 'Example CDN',

  enabled: true
};

cf.createDistribution(process.argv[2], config, function(err, oai) {
  if (err) {
    console.error(err);
  } else {
    console.log(oai);
  }
});
