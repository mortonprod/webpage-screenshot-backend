const chromium = require("@sparticuz/chromium");
const puppeteer = require("puppeteer-core");
const { S3Client, PutObjectCommand, GetObjectCommand } = require("@aws-sdk/client-s3");
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");
const { v4: uuidv4 } = require("uuid");

const s3 = new S3Client({ region: process.env.S3_REGION });

exports.screenshot = async (event) => {
  console.log(JSON.stringify(event));

  if (!event.queryStringParameters || !event.queryStringParameters["url"]) {
    return { statusCode: 400 };
  }
  if (!event.headers || !event.headers["User-Agent"]) {
    return { statusCode: 400 };
  }
  if (!event.headers || !event.headers["origin"]) {
    return { statusCode: 400 };
  }
  if (!event.headers["origin"].includes("https://pagemelt.alexandermorton.co.uk")) {
    return { statusCode: 401 };
  }

  const url = decodeURIComponent(event.queryStringParameters["url"]);
  const userAgent = event.headers["User-Agent"];
  const id = uuidv4();

  try {
    console.log(`IP: ${event.requestContext.identity.sourceIp}, URL: ${event.queryStringParameters["url"]}`);
    const vw = Number(event.queryStringParameters["vw"]) || Number(process.env.WIDTH);
    let vh = Number(event.queryStringParameters["vh"]) || Number(process.env.HEIGHT);
    vh = Number(vh) + Number(process.env.SCROLL_HEIGHT);

    const buffer = await getBuffer(url, vw, vh, userAgent);
    const Key = getBucketKey(url, id, vw, vh);

    await s3.send(
      new PutObjectCommand({
        Bucket: process.env.S3_BUCKET,
        Key,
        Body: buffer,
        ContentType: "image/jpeg",
        CacheControl: "max-age=86400",
      })
    );

    const signedUrl = await getSignedUrl(
      s3,
      new GetObjectCommand({ Bucket: process.env.S3_BUCKET, Key }),
      { expiresIn: 30 }
    );

    return {
      statusCode: 200,
      headers: {
        "Access-Control-Allow-Origin": "https://pagemelt.alexandermorton.co.uk",
      },
      body: JSON.stringify({ url: signedUrl }),
    };
  } catch (e) {
    console.error(JSON.stringify(e));
    return {
      statusCode: 500,
      headers: {
        "Access-Control-Allow-Origin": "https://pagemelt.alexandermorton.co.uk",
      },
    };
  }
};

function getBucketKey(url, id, width, height) {
  url = url.replace(/https?:\/\//, "");
  url = url.replace(/\./g, "_");
  url = url.replace(/\//g, "__");
  return `${url}___${width}___${height}___${id}.jpg`;
}

async function getBuffer(url, width, height, userAgent) {
  const browser = await puppeteer.launch({
    args: chromium.args,
    executablePath: await chromium.executablePath(),
    defaultViewport: {
      width: Number(width),
      height: Number(height),
    },
  });
  try {
    const page = await browser.newPage();
    await page.setUserAgent(userAgent);
    await page.goto(url);
    const buffer = await page.screenshot({ quality: 30, type: "jpeg" });
    return buffer;
  } finally {
    await browser.close();
  }
}
