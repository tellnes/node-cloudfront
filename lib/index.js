var https = require('https')
  , crypto = require('crypto')
  , data2xml = require('data2xml')
  , xml2js = require('xml2js')
  , querystring = require('querystring')
  , util = require('util')

function handleResponseError(err, res, body, cb) {
  if (err) { cb(err); return true; }

  if (res.statusCode >= 400) {
    if (body && body.Error && body.Error.Code) {
      err = new Error(body.Error.Code + (body.Error.Message ? ': ' + body.Error.Message : ''));
      err.code = body.Error.Code;
      cb(err);
    } else {
      cb(new Error('AWS Error; status code: ' + res.statusCode));
    }
    return true;
  }
  return false;
}

function listOptsToPath(path, opts) {
  var qs = {};

  if (opts.marker) {
    qs.Marker = opts.marker;
  }
  if (opts.maxItems) {
    qs.MaxItems = opts.maxItems;
  }

  if (opts.streaming) {
    path = 'streaming-' + path;
  }

  qs = querystring.stringify(qs);

  return path + (qs ? '?' + qs : '');
}

function listBodyToInfo(that, opts, DataConstr, body) {

  var info = {};
  info.isTruncated = body.IsTruncated == 'true';
  info.marker = body.Maker;
  info.nextMaker = body.NextMarker;
  info.maxItems = body.MaxItems;

  var listKey = DataConstr.name + 'Summary';
  if (opts.streaming) { listKey = 'Streaming' + listKey; }

  info.list = body[listKey].map(function(data) {
    return new DataConstr(that, opts, data);
  });

  return info;
}


function CloudFront(key, secret) {
  this.key = key;
  this.secret = secret;
}
CloudFront.version = '2010-11-01';
CloudFront.endpoint = 'cloudfront.amazonaws.com';

CloudFront.prototype.request = function(method, path, cb) {
  var headers = {};
  headers.date = new Date().toUTCString();

  var signature = crypto.createHmac('sha1', this.secret)
                    .update(headers.date)
                    .digest('base64');

  headers.authorization = 'AWS ' + this.key + ':' + signature;

  var req = https.request({
    host: CloudFront.endpoint,
    headers: headers,
    method: method,
    path: '/' + CloudFront.version + '/' + path
  });

  req.on('response', function(res) {
    var parser = new xml2js.Parser();
    res.setEncoding('utf8');
    res.on('data', function(chunk) {
      parser.saxParser.write(chunk);
    });

    parser.on('end', function(body) {
      cb(null, body);
    });
    parser.on("error", function(err) {
      cb(err);
    });

  });

  return req;
};



CloudFront.prototype.getDistribution = function(distribution, cb) {
  var self = this;
  this.request('GET', 'distribution/' + distribution, function(err, body) {
    if (err) return cb(err);

    var item = new Distribution(self, {}, body);
    cb(null, item);
  }).end();
};

CloudFront.prototype.listDistributions = function(opts, cb) {
  var self = this;
  this.request('GET', listOptsToPath('distribution', opts), function(err, body) {
    if (err) return cb(err);

    var info = listBodyToInfo(self, {streaming: opts.streaming}, Distribution, body);
    cb(null, info.list, info);
  }).end();
};

/* Invalidation */

CloudFront.prototype.generateInvalidationXml = function(callerReference, paths) {
  return data2xml('InvalidationBatch', {
    Path: paths,
    CallerReference: callerReference
  });
};

CloudFront.prototype.createInvalidation = function(distribution, callerReference, paths, cb) {
  if (!distribution) { throw new TypeError('First argument must be a valid distribution id'); }
  var req = this.request('POST', 'distribution/' + distribution + '/invalidation', cb);
  req.write(this.generateInvalidationXml(callerReference, paths));
  req.end();
};

CloudFront.prototype.getInvalidation = function(distribution, id, cb) {
  var self = this;
  this.request('GET', 'distribution/' + distribution + '/invalidation/' + id, function(err, body) {
    if (err) return cb(err);

    var item = new Invalidation(self, {distribution: distribution}, body);
    cb(null, item);
  }).end();
};

CloudFront.prototype.listInvalidations = function(distribution, opts, cb) {
  var self = this;
  this.request('GET', listOptsToPath('distribution/' + distribution + '/invalidation', opts), function(err, body) {
    if (err) return cb(err);

    var info = listBodyToInfo(self, {distribution: distribution}, Invalidation, body);
    cb(null, info.list, info);
  }).end();
};



function CFObject(client, info) {
    Object.defineProperty(this, 'client', {
    value: client,
    enumerable: false
  });
}

function Distribution(client, info, data) {
  CFObject.call(this, client, info);
  this.streaming = !!info.streaming;
  this.id = data.Id;
  this.status = data.Status;
  this.lastModified = new Date(data.LastModifiedTime);
  this.domainName = data.DomainName;
  this.comment = data.Comment;
  this.enabled = data.Enabled == 'true';
  this.origin = {};
  if (data.S3Origin) {
    this.origin.type = 's3';
    this.origin.domainName = data.S3Origin.DNSName;
    this.origin.accessIdentity = data.S3Origin.OriginAccessIdentity;

  } else if (data.CustomOrigin) {
    this.origin.type = 'custom';
    this.origin.domainName = data.CustomOrigin.DNSName;
    this.origin.httpPort = data.CustomOrigin.HTTPPort;
    this.origin.httpsPort = data.CustomOrigin.HTTPSPort;
    this.origin.protocolPolicy = data.CustomOrigin.OriginProtocolPolicy;

  }
  this.cname = data.CNAME ? (Array.isArray(data.CNAME) ? data.CNAME : [data.CNAME]) : [];
}
util.inherits(Distribution, CFObject);

function Invalidation(client, info, data) {
  CFObject.call(this, client, info);
  this.distribution = info.distribution;
  this.id = data.Id;
  this.status = data.Status;
  if (data.InvalidationBatch) {
    this.createTime = new Date(data.CreateTime);
    this.paths = Array.isArray(data.InvalidationBatch.Path) ? data.InvalidationBatch.Path : [data.InvalidationBatch.Path];
    this.callerReference = data.InvalidationBatch.CallerReference;
  } else {
    this.createTime = null;
    this.paths = null;
    this.callerReference = null;
  }
}
util.inherits(Invalidation, CFObject);



function createClient(key, secret) {
  return new CloudFront(key, secret);
}

module.exports = exports = createClient
exports.createClient = createClient;
exports.CloudFront = CloudFront;
