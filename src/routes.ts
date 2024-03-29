import moment from 'moment';
import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { AssignmentUpdate } from './models/assignment';
import { PersonUpdate } from './models/person';
import Person from './models/person';
import Messages from './controllers/messages';
import Voice from './controllers/voice';
import Sheets from './controllers/sheets';
import Calendar from './controllers/calendar';

export interface WebhookUpdate {
	secret: string;
	assignment?: AssignmentUpdate;
	person?: PersonUpdate;
}

export interface IncomingMessage {
	ApiVersion: '2010-04-01';
	AccountSid: string;
	Body: string;
	NumMedia: string;
	From: string;
	[property: string]: string;
}

async function routes(app: FastifyInstance) {
	app.all(
		'/',
		async (
			request: FastifyRequest<{
				Querystring: {
					login?: string;
				};
			}>,
			reply: FastifyReply
		) => {
			let calendar = await Calendar.getInstance();
			let sheets = await Sheets.getInstance();
			let messages = Messages.getInstance();
			let backup = await sheets.currentBackup();
			let backupName = backup ? backup.name : 'Unknown';
			let loginBanner = '';
			let person = await Person.current(request);
			if (request.query.login && request.query.login == 'no') {
				loginBanner =
					"Sorry, your login failed. Please text 'login' to Chickenbot.";
			} else if (person) {
				loginBanner = `You are logged in. Hello, ${person.name}!`;
			}
			return reply.view('index.ejs', {
				phone: messages.displayPhone(messages.phone),
				spreadsheet_url: `https://docs.google.com/spreadsheets/d/${sheets.id}/edit`,
				assignments: calendar.assignments,
				backup: backupName,
				today: moment().format('YYYY-MM-DD'),
				loginBanner: loginBanner,
			});
		}
	);

	app.post(
		'/message',
		async (
			request: FastifyRequest<{ Body: IncomingMessage }>,
			reply: FastifyReply
		) => {
			let messages, person;
			let rsp = '';
			try {
				messages = Messages.getInstance();
				person = await messages.validateMessage(request.body);
				app.log.warn(
					`Message from ${person.name}: ${request.body.Body}`
				);
				let response = await messages.handleMessage(
					person,
					request.body
				);
				if (response) {
					messages.sendMessage(person, response);
				}
			} catch (err) {
				app.log.error(err);
				if (person && messages) {
					messages.relayErrorToBackup(
						request.body,
						person,
						err as Error
					);
					messages.sendMessage(
						person,
						'Oops, sorry something went wrong.'
					);
					reply.status(500);
				}
			}
			return reply.status(200);
		}
	);

	app.post(
		'/message/status',
		async (
			request: FastifyRequest<{ Body: IncomingMessage }>,
			reply: FastifyReply
		) => {
			let error = request.body.errorMessage
				? `(${request.body.errorMessage})`
				: '';
			await Messages.updatePendingMessage(
				request.body.MessageSid,
				request.body.MessageStatus
			);
			reply.send({
				ok: true,
			});
		}
	);

	app.post(
		'/call/:phone',
		async (
			request: FastifyRequest<{ Params: { phone: string } }>,
			reply: FastifyReply
		) => {
			let voice = Voice.getInstance();
			reply.header('Content-Type', 'text/xml');
			try {
				let rsp = await voice.handlePrompt(request.params.phone);
				return rsp;
			} catch (err) {
				reply.status(500);
				app.log.error(err);
				return voice.say('Sorry, something went wrong. Goodbye!');
			}
		}
	);

	app.post(
		'/call/:phone/response',
		async (
			request: FastifyRequest<{
				Params: { phone: string };
				Body: { Digits: string };
			}>,
			reply: FastifyReply
		) => {
			let voice = Voice.getInstance();
			reply.header('Content-Type', 'text/xml');
			try {
				let rsp = await voice.handleResponse(
					request.params.phone,
					request.body.Digits
				);
				return rsp;
			} catch (err) {
				reply.status(500);
				app.log.error(err);
				return voice.say('Sorry, something went wrong. Goodbye!');
			}
		}
	);

	app.post(
		'/call/:phone/status',
		async (
			request: FastifyRequest<{
				Params: { phone: string };
				Body: { CallStatus: string };
			}>,
			reply: FastifyReply
		) => {
			try {
				let voice = Voice.getInstance();
				await voice.handleStatus(
					request.params.phone,
					request.body.CallStatus
				);
				return {
					ok: true,
				};
			} catch (err) {
				app.log.error(err);
			}
		}
	);

	app.post(
		'/update',
		async (
			request: FastifyRequest<{
				Body: {
					secret: string;
					assignment?: AssignmentUpdate;
					person?: PersonUpdate;
				};
			}>,
			reply: FastifyReply
		) => {
			try {
				let sheets = await Sheets.getInstance();
				return sheets.updateFromWebhook(request.body);
			} catch (err) {
				app.log.error(err);
				return {
					error: (err as Error).message,
				};
			}
		}
	);

	app.get(
		'/login/:code',
		(
			request: FastifyRequest<{
				Params: {
					code: string;
				};
			}>,
			reply: FastifyReply
		) => {
			let code = parseInt(request.params.code);
			let name = Person.checkLoginCode(code);
			if (name) {
				app.log.warn(`Successful login by ${name} from ${request.ip}`);
				request.session.set('person', name);
				reply.redirect('/?login=yes');
			} else {
				app.log.warn(`Unsuccessful login from ${request.ip}`);
				reply.redirect('/?login=no');
			}
		}
	);
}

export default routes;
