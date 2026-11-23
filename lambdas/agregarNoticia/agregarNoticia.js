import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand } from "@aws-sdk/lib-dynamodb";
import { SNSClient, PublishCommand } from "@aws-sdk/client-sns"; // 1. Importar el cliente y comando de SNS
import { randomUUID } from "node:crypto";

const client = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(client);
const snsClient = new SNSClient({}); // 2. Inicializar el cliente de SNS

const headers = {
    "Content-Type": "application/json",
    //"Access-Control-Allow-Origin": "*",
    //"Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "content-type",
};

export const handler = async (event) => {
    let editor;
    try {
        editor = await requireEditor(event);
    } catch (error) {
        if (error instanceof AuthError) return authErrorResponse(error);
        throw error;
    }
    try {
        if (event.requestContext?.http?.method === "OPTIONS") {
            return { statusCode: 204, headers, body: "" };
        }

        // 1. Manejar el payload si viene de API Gateway (event.body) o si viene de una invocación directa (event)
        const body = event.body ? JSON.parse(event.body) : event;
        const { titulo, detalles, fecha, imagenUrl } = body;

        // 2. Validar parámetros requeridos
        if (!titulo || !detalles || !fecha) {
            return {
                statusCode: 400,
                headers,
                body: JSON.stringify({ error: "Faltan parámetros requeridos: titulo, descripcion o fecha." })
            };
        }

        if (imagenUrl && !/^https:\/\/yhos-noticias-imagenes-906-2026\.s3\.us-east-2\.amazonaws\.com\/imagenes\//.test(imagenUrl)) {
            return {
                statusCode: 400,
                headers,
                body: JSON.stringify({ error: "La URL de imagen no pertenece al bucket de noticias." })
            };
        }

        // 3. Crear el objeto con un UUID nativo
        const item = {
            idNoticia: randomUUID(),
            titulo,
            detalles,
            fecha,
            imagenUrl: imagenUrl || null,
            creadoEn: new Date().toISOString()
        };

        // 4. Configurar la inserción en la tabla 'Noticias'
        const command = new PutCommand({
            TableName: "Noticias",
            Item: item
        });

        // 5. Guardar en DynamoDB
        await docClient.send(command);
        console.log("INFO: Noticia guardada", item.idNoticia);

        // 6. Enviar la notificación a Amazon SNS 
        try {
            const snsCommand = new PublishCommand({
                TopicArn: process.env.SNS_TOPIC_ARN, 
                Subject: "Nueva Noticia en Gaceta UNSIS",
                Message: `Se ha publicado una nueva noticia:\n\nTítulo: "${item.titulo}"\nFecha: ${item.fecha}\n\nRevisa el portal para más detalles.`
            });

            const snsResponse = await snsClient.send(snsCommand);
            console.log("INFO: Notificación SNS enviada con éxito:", snsResponse.MessageId);
        } catch (snsError) {
            // No detenemos el flujo principal si falla la notificación, pero lo registramos
            console.error("Error al enviar notificación SNS:", snsError);
        }

        return {
            statusCode: 201,
            headers,
            body: JSON.stringify({ mensaje: "Noticia guardada con éxito y notificación enviada", item })
        };

    } catch (error) {
        console.error("Error detectado:", error);
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ error: "Error interno del servidor", detalle: error.message })
        };
    }
};