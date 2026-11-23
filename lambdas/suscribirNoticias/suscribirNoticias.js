import { SNSClient, SubscribeCommand } from "@aws-sdk/client-sns";

const snsClient = new SNSClient({});

const headers = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
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

        const body = event.body ? JSON.parse(event.body) : event;
        const { email } = body;

        if (!email || !email.includes("@")) {
            return {
                statusCode: 400,
                headers,
                body: JSON.stringify({ error: "Se requiere un correo electrónico válido." })
            };
        }

        // Parámetros para suscribir el correo al Tópico SNS
        const subscribeParams = {
            TopicArn: process.env.SNS_TOPIC_ARN,
            Protocol: "email",
            Endpoint: email,
            ReturnSubscriptionArn: true
        };

        const command = new SubscribeCommand(subscribeParams);
        await snsClient.send(command);

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({ 
                mensaje: "Suscripción iniciada. Por favor, revisa tu bandeja de entrada y confirma la suscripción." 
            })
        };

    } catch (error) {
        console.error("Error al suscribir:", error);
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ error: "Error al procesar la suscripción", detalle: error.message })
        };
    }
};