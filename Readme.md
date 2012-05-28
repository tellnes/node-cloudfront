# Amazon CloudFront client for Node.js

Implements all the functionality in CloudFront version 2012-05-05. In addition, is there a `getPrivateUrl` method to create signed urls.

Please take a look at the examples folder.

## How to Install

    npm install cloudfront

## How to use

```js
var cloudfront = require('cloudfront');

var cf = cloudfront.createClient('access key id', 'access key secret');

cf.listDistributions(function(err, list, info) {
  console.log('Is truncated?', info.isTruncated ? 'yes' : 'no');
  console.log(list);
});

```

Please take a look at the examples in the example folder.

## License

[MIT](https://github.com/tellnes/node-cloudfront/blob/master/LICENSE)
