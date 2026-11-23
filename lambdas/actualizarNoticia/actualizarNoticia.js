import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, ScanCommand } from "@aws-sdk/lib-dynamodb";

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
    const method = event.requestContext?.http?.method || event.httpMethod;
    const headers = {
      "Content-Type": "application/json",
      "Access-Control-Allow-Headers": "content-type",
    };

    if (method === "OPTIONS") {
      return { statusCode: 204, headers, body: "" };
    }

    const command = new ScanCommand({ TableName: "Noticias" });
    const respuesta = await docClient.send(command);
    const noticias = (respuesta.Items ?? []).map((noticia) => ({
      ...noticia,
      imagenUrl: noticia.imagenUrl || noticia.imageUrl || null
    }));

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify(noticias),
    };
  } catch (error) {
    console.error("Error al obtener noticias:", error);
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify({ error: "No se pudieron obtener las noticias" }),
    };
  }
};