import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { randomUUID } from "node:crypto";

const REGION = "us-east-2";
const BUCKET = "yhos-noticias-imagenes-906-2026";

const s3 = new S3Client({ region: REGION });

export const handler = async (event) => {
    let editor;
    try {
        editor = await requireEditor(event);
    } catch (error) {
        if (error instanceof AuthError) return authErrorResponse(error);
        throw error;
    }
    const headers = {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, OPTIONS"
    };

    const httpMethod = event.requestContext?.http?.method || event.httpMethod;
    if (httpMethod === "OPTIONS") {
        return {
            statusCode: 200,
            headers,
            body: ""
        };
    }

    try {
        const params = event.queryStringParameters ?? {};
        const action = params.action?.trim() || "upload";

        if (action === "read") {
            const key = params.key?.trim();
            if (!key || !key.startsWith("imagenes/")) {
                return {
                    statusCode: 400,
                    headers,
                    body: JSON.stringify({ error: "La clave de imagen no es válida" })
                };
            }

            const command = new GetObjectCommand({ Bucket: BUCKET, Key: key });
            const imageUrl = await getSignedUrl(s3, command, { expiresIn: 900 });
            return {
                statusCode: 200,
                headers,
                body: JSON.stringify({ imageUrl, key })
            };
        }

        const fileName = params.file?.trim();

        if (!fileName ||
            !/\.(jpg|jpeg|png|webp)$/i.test(fileName)) {
                console.log(fileName);
            return {
                statusCode: 400,
                headers,
                body: JSON.stringify({
                    error: "Archivo no válido"
                })
            };
        }

        const contentTypePorExtension = {
            jpg: "image/jpeg",
            jpeg: "image/jpeg",
            png: "image/png",
            webp: "image/webp"
        };

        const extension = fileName.split(".").pop().toLowerCase();
        const contentType = contentTypePorExtension[extension];
        const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
        const key = `imagenes/${randomUUID()}-${safeName}`;

        const command = new PutObjectCommand({
            Bucket: BUCKET,
            Key: key,
            ContentType: contentType
        });

        const uploadUrl = await getSignedUrl(s3, command, {
            expiresIn: 300
        });

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({
                uploadUrl,
                key,
                contentType,
                imagenUrl: `https://${BUCKET}.s3.${REGION}.amazonaws.com/${key}`
            })
        };

    } catch (error) {
        console.error("Error generando URL:", error);

        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({
                error: "No se pudo generar la URL prefirmada"
            })
        };
    }
};