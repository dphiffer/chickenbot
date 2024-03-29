import twilio, { Twilio, twiml } from 'twilio';
import { TwilioConfig } from '../app';
import Assignment, { AssignmentStatus } from '../models/assignment';
import app from '../app';
import Person from '../models/person';
import Task from '../models/task';
import Sheets from './sheets';
import Messages from './messages';

export interface CallDetails {
	person: Person;
	assignment: Assignment;
	task: Task;
}

class Voice {
	private static instance: Voice;
	private static config: TwilioConfig;

	private calls: { [phone: string]: CallDetails } = {};
	twilio: Twilio;
	phone: string;
	url: string;

	private constructor() {
		this.twilio = twilio(Voice.config.accountSid, Voice.config.authToken);
		this.phone = Voice.config.phone;
		this.url = Voice.config.serverUrl;
	}

	static getInstance() {
		if (this.instance) {
			return this.instance;
		}
		this.instance = new Voice();
		return this.instance;
	}

	static configure(config: TwilioConfig) {
		this.config = config;
	}

	async call(person: Person) {
		if (!person.assignment) {
			throw new Error(`Could not find assignment for ${person.name}`);
		}
		app.log.warn(`Calling ${person.name}...`);
		let assignment = person.assignment;
		let sheets = await Sheets.getInstance();
		let [task] = sheets.tasks.filter(t => t.name == assignment.task);
		if (!task) {
			throw new Error(`Could not find task for ${person.name}`);
		}
		this.calls[person.phone] = {
			person: person,
			assignment: assignment,
			task: task,
		};
		await this.twilio.calls.create({
			url: `${this.url}/call/${person.phone}`,
			statusCallback: `${this.url}/call/${person.phone}/status`,
			to: person.phone,
			from: this.phone,
		});
	}

	async handlePrompt(phone: string) {
		let call = this.calls[phone];
		if (!call) {
			throw new Error(`Could not find call for ${phone}`);
		}
		let message = `Hello ${call.person.name}, ${call.task.question} Please press 1 if you are done with the task. Press 2 to snooze the task if you need more time.`;
		app.log.warn(`Saying: ${message}`);
		let rsp = this.say(message);
		rsp.gather({
			action: `${this.url}/call/${phone}/response`,
			numDigits: 1,
		});
		return rsp.toString();
	}

	async handleResponse(phone: string, digits: string) {
		let call = this.calls[phone];
		let rsp;
		if (!call) {
			throw new Error(`Could not find call for ${phone}`);
		}
		if (!call.assignment) {
			throw new Error(`Could not find assignment for ${phone}`);
		}
		if (digits == '1') {
			let affirmation = Person.getAffirmation(true);
			app.log.warn(`Task is done. Saying: ${affirmation}`);
			await call.assignment.setDone();
			rsp = this.say(affirmation);
			rsp.say('Goodbye!');
			rsp.hangup();
		} else if (digits == '2') {
			let time = await call.assignment.snooze();
			let message = `Great, I'll ask again at ${time}.`;
			rsp = this.say(message);
			app.log.warn(`Snoozing task. Saying: ${message}`);
			rsp.say('Goodbye!');
			rsp.hangup();
		} else {
			let message =
				'Please press 1 if you are done with the task. Press 2 to snooze the task if you need more time.';
			app.log.warn(`Invalid input: ${digits}. Saying: ${message}`);
			rsp = this.say(message);
			rsp.gather({
				action: `${this.url}/call/${phone}/response`,
				numDigits: 1,
			});
		}
		return rsp.toString();
	}

	handleStatus(phone: string, status: string) {
		let call = this.calls[phone];
		if (!call) {
			throw new Error(`Could not find call for ${phone}`);
		}
		if (call.assignment.status == AssignmentStatus.PENDING) {
			let messages = Messages.getInstance();
			messages.sendAssignment(call.person, call.assignment);
		}
	}

	say(prompt: string) {
		let rsp = new twiml.VoiceResponse();
		rsp.say(prompt);
		return rsp;
	}
}

export default Voice;
