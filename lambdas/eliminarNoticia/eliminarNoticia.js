import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, DeleteCommand } from "@aws-sdk/lib-dynamodb";

const client = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(client);

export const handler = async (event) => {
    let editor;
    try {
        editor = await requireEditor(event);
    } catch (error) {
        if (error instanceof AuthError) return authErrorResponse(error);
        throw error;
    }
    try {
        const idNoticia = event.pathParameters?.idNoticia || (event.body ? JSON.parse(event.body).idNoticia : null);

        if (!idNoticia) {
            return {
                statusCode: 400,
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ error: "Se requiere el idNoticia para eliminar." })
            };
        }

        const command = new DeleteCommand({
            TableName: "Noticias",
            Key: { idNoticia }
        });

        await docClient.send(command);

        return {
            statusCode: 200,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ mensaje: `Noticia con ID ${idNoticia} eliminada correctamente.` }),
        };
    } catch (error) {
        console.error("Error al eliminar:", error);
        return {
            statusCode: 500,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ error: "No se pudo eliminar la noticia", detalle: error.message }),
        };
    }
};