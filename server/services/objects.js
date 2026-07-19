import { S3Client, HeadObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";

const BUCKET = process.env.OBJECTS_BUCKET; // pd-objects-dev | pd-objects-prod
const REGION = process.env.AWS_REGION || "us-east-2";
const client = new S3Client({ region: REGION }); // IRSA supplies creds in-cluster

export const keyFor = (title) => `draw/public/drawings/${title}.bin`;

export async function headObject(title) {
	try {
		const r = await client.send(new HeadObjectCommand({ Bucket: BUCKET, Key: keyFor(title) }));
		return { lastModified: r.LastModified };
	} catch (err) {
		if (err.name === "NotFound" || err.$metadata?.httpStatusCode === 404) return null;
		throw err;
	}
}

export async function putObject(title, body) {
	await client.send(new PutObjectCommand({
		Bucket: BUCKET,
		Key: keyFor(title),
		Body: body,
		ContentType: "application/octet-stream",
		CacheControl: "public, max-age=300",
		Metadata: { "schema-version": "1" },
		// nosniff belongs on the SERVING response (Cloudflare/S3 website), but set
		// it here too so any direct fetch carries it.
		ContentDisposition: "inline",
	}));
}
