var cloudfront = require('..')
  , inspect = require('eyes').inspector({maxLength: -1})

var cf = cloudfront.createClient(process.env.AWS_KEY, process.env.AWS_SECRET)

cf.listInvalidations(process.argv[2], function(err, list, info) {
  if (err) {
    inspect(err)
  } else {
    inspect(list)
  }
})
