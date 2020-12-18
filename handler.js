// https://codissimo.sinumo.tech/2019/12/27/serverless-puppeteer-with-aws-lambda-layers-and-node-js/
const chromeLambda = require("chrome-aws-lambda");
const S3Client = require("aws-sdk/clients/s3");
const s3 = new S3Client({ region: process.env.S3_REGION });
const {v4 : uuidv4} = require('uuid')

exports.screenshot = async (event, context, callback) => {
  if (!event.queryStringParameters || !event.queryStringParameters["url"]) {
    return {
      statusCode: 400
    };
  }
  const url = event.queryStringParameters["url"];
  console.log(JSON.stringify(event));
  const id = uuidv4();
  const buffer = await getBuffer(url,process.env.WIDTH,process.env.HEIGHT);
  let Key = getBucketName(url,id,process.env.WIDTH,process.env.HEIGHT);
  const result = await s3.upload({
      Bucket: process.env.S3_BUCKET,
      Key,
      Body: buffer,
      ContentType: "image/png"
    }).promise();
  const signedUrl = s3.getSignedUrl('getObject', {
      Bucket: process.env.S3_BUCKET,
      Key,
      Expires: 1000
  });

  return {
    statusCode: 200,
    body: JSON.stringify({
        url: signedUrl
    })
  };
};

function getBucketName(url, id, width, height) {
  /// Remove protocols
  url = url.replace(/https:\/\//, '').replace(/http:\/\//, '');
  /// Replace . with _
  url = url.replace(/[\.]/g,'_');
  // Replace / with __
  url = url.replace(/[\/]/g,'__');
  /// Split width height and id using ____
  return `${url}___${width}___${height}___${id}.png`;
}

async function getBuffer(url,width, height) {
  const browser = await chromeLambda.puppeteer.launch({
    args: chromeLambda.args,
    executablePath: await chromeLambda.executablePath,
    defaultViewport: {
      width: Number(width),
      height: Number(height)
    } 
  });
  const page = await browser.newPage();
  await page.goto(url);
  const buffer = await page.screenshot()
  return buffer;
}
