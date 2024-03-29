import { GoogleSpreadsheetRow } from 'google-spreadsheet';
import moment from 'moment-timezone';
import Sheets from '../controllers/sheets';
import Assignment from './assignment';
import { clearTimeout } from 'timers';
import app from '../app';
import { callbackify } from 'util';
import { FastifyRequest } from 'fastify';

export interface PersonUpdate {
	name: string;
	phone: string;
	call: string;
	status: PersonStatus;
	away: string;
}

export enum PersonContext {
	READY = 'ready',
	ASSIGNMENT = 'assignment',
	ANNOUNCE = 'announce',
	CHAT = 'chat',
	SCHEDULE_START = 'schedule-start',
	SCHEDULE_AWAY_DAYS = 'schedule-away-days',
	SCHEDULE_AWAY_FULL = 'schedule-away-full',
	SCHEDULE_AWAY_TIME = 'schedule-away-time',
	SCHEDULE_AWAY_CONFIRM = 'schedule-away-confirm',
	SCHEDULE_SEND = 'schedule-send',
}

export enum PersonStatus {
	ACTIVE = 'active',
	BACKUP = 'backup',
	INACTIVE = 'inactive',
	VACATION = 'vacation',
}

export default class Person {
	name: string;
	phone: string;
	call: boolean;
	status: PersonStatus;
	away: string;

	schedule: null | string = null;
	assignment: null | Assignment = null;
	context: PersonContext = PersonContext.READY;
	chatContext: null | Person = null;
	contextTimeout: null | NodeJS.Timeout = null;
	scheduleDayIndex: number = 0;

	protected static loginCodes: {
		name: string;
		code: number;
		timeout: NodeJS.Timeout;
	}[] = [];

	constructor(sheets: Sheets, row: GoogleSpreadsheetRow) {
		this.name = row.name;
		this.phone = this.normalizePhone(row.phone);
		this.call = row.call == 'yes';
		this.status = row.status;
		this.away = row.away || '';
	}

	static async current(request: FastifyRequest) {
		let name = request.session.get('person');
		let sheets = await Sheets.getInstance();
		if (name) {
			let [person] = sheets.people.filter(p => p.name == name);
			if (person) {
				return person;
			}
		}
		return null;
	}

	normalizePhone(phone: string) {
		phone = phone.replace(/\D/g, '');
		if (phone.substring(0, 1) != '1') {
			phone = `1${phone}`;
		}
		phone = `+${phone}`;
		return phone;
	}

	static getAffirmation(textOnly = false) {
		let affirmations = [
			'Thank you!',
			'The chickens appreciate you so much.',
			'Excellent, thank you.',
			'You’re the best!',
			'❤️🐔❤️',
		];
		let length = textOnly ? affirmations.length - 1 : affirmations.length;
		let index = Math.floor(Math.random() * length);
		return affirmations[index];
	}

	async updateStatus(status: PersonStatus) {
		let sheets = await Sheets.getInstance();
		this.status = status;
		let sheet = sheets.doc.sheetsByTitle['People'];
		let rows = await sheet.getRows();
		for (let row of rows) {
			if (row.name == this.name) {
				row.status = status;
				await row.save();
				break;
			}
		}
		return this;
	}

	async updateAway(awayDays: string[]) {
		this.away = awayDays.join(', ');
		let sheets = await Sheets.getInstance();
		let sheet = sheets.doc.sheetsByTitle['People'];
		let rows = await sheet.getRows();
		for (let row of rows) {
			if (row.name == this.name) {
				row.away = this.away;
				await row.save();
				break;
			}
		}
		return awayDays
			.map(date => {
				let suffix = '';
				if (date.match(/ am$/)) {
					date = date.replace(/ am$/, '');
					suffix = ' (morning)';
				} else if (date.match(/ pm$/)) {
					date = date.replace(/ pm$/, '');
					suffix = ' (evening)';
				} else if (date.match(/ full$/)) {
					date = date.replace(/ full$/, '');
					suffix = ' (full day)';
				}
				return moment(date, 'YYYY-MM-DD').format('ddd M/D') + suffix;
			})
			.join(', ');
	}

	setSchedule(assignments: Assignment[]) {
		let assigned = assignments.map(a => {
			let date = moment(a.date, 'M/D').format('ddd M/D');
			return `${date}: ${a.task}`;
		});
		if (assigned.length == 0) {
			this.schedule = null;
			return;
		}
		let vacationApology =
			this.status == PersonStatus.VACATION
				? 'sorry to interrupt your vacation but '
				: '';
		this.schedule = `Hi ${
			this.name
		}, ${vacationApology}here are your scheduled chicken tasks for this week:\n${assigned.join(
			'\n'
		)}`;
	}

	isAway(date: string, time: string) {
		let awayDays = this.away.split(', ');
		if (awayDays.indexOf(date) > -1) {
			return true;
		}
		for (let day of awayDays) {
			let regex = new RegExp(`^${date} (am|pm|full)$`);
			let match = day.match(regex);
			if (match) {
				let taskTime = moment(
					`${date} ${time}`,
					'YYYY-MM-DD h:mm A'
				).format('YYYY-MM-DD HH:mm');
				if (match[1] == 'am') {
					let awayStart = `${date} 00:00`;
					let awayEnd = `${date} 12:00`;
					if (taskTime >= awayStart && taskTime <= awayEnd) {
						return true;
					}
				} else if (match[1] == 'pm') {
					let awayStart = `${date} 12:00`;
					let awayEnd = `${date} 23:59`;
					if (taskTime >= awayStart && taskTime <= awayEnd) {
						return true;
					}
				} else if (match[1] == 'full') {
					return true;
				}
			}
		}
		return false;
	}

	async setTemporaryContext(
		context: PersonContext,
		onExpire: Function,
		chatContext: null | Person = null
	) {
		app.log.warn(
			`Setting ${this.name}'s temporary context to '${context}'`
		);
		this.context = context;
		if (chatContext) {
			this.chatContext = chatContext;
		}
		if (this.contextTimeout) {
			clearTimeout(this.contextTimeout);
		}
		this.contextTimeout = setTimeout(() => {
			onExpire();
			app.log.warn(
				`Resetting ${this.name}'s context to '${PersonContext.READY}'`
			);
			if (this.context == context) {
				this.context = PersonContext.READY;
			}
			this.chatContext = null;
			this.contextTimeout = null;
		}, 60 * 60 * 1000);
	}

	getLoginCode() {
		let code: number;
		let existing = Person.loginCodes.find(c => c.name == this.name);
		if (existing) {
			// Delete any existing login codes for this person
			clearTimeout(existing.timeout);
			Person.loginCodes = Person.loginCodes.filter(
				c => c.name != this.name
			);
		}
		do {
			// Ensure the login code is unique
			code = 10000 + Math.floor(Math.random() * 100000);
		} while (Person.loginCodes.filter(c => c.code == code).length > 0);
		Person.loginCodes.push({
			name: this.name,
			code: code,
			timeout: setTimeout(() => {
				Person.loginCodes = Person.loginCodes.filter(
					c => c.name != this.name
				);
			}, 15 * 60 * 1000),
		});
		return code;
	}

	static checkLoginCode(code: number) {
		let login = Person.loginCodes.find(c => c.code == code);
		if (login) {
			return login.name;
		}
		return '';
	}
}
