import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { IncomingMessage, EventUpdate } from './types';
import { handleMessage, messageResponse } from './sms';
import config from './config';
import Sheets from './sheets';

async function routes(app: FastifyInstance) {
    app.get('/', (request, reply) => {
        return {
            chickenbot: '🐔'
        };
    });
    
    app.post('/sms', async (request: FastifyRequest<{ Body: IncomingMessage }>, reply: FastifyReply) => {
        try {
            let response = handleMessage(request.body);
            if (response) {
                return messageResponse(reply, response);
            } else {
                return {
                    chickenbot: '🐔'
                };
            }
        } catch (err) {
            return messageResponse(reply, (err as Error).message);
        }
    });

    app.post('/update', async (request: FastifyRequest<{ Body: EventUpdate }>, reply: FastifyReply) => {
        try {
            let sheets = await Sheets.getInstance(config.google);
            let event = await sheets.updateEvent(request.body);
            return {
                event: event
            };
        } catch (err) {
            return {
                error: (err as Error).message
            };
        }
    });
}

export default routes;