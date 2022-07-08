"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const config_1 = __importDefault(require("../config"));
const types_1 = require("../types");
const twilio_1 = require("twilio");
const twilio_2 = __importDefault(require("twilio"));
const sheets_1 = __importDefault(require("./sheets"));
const calendar_1 = __importDefault(require("./calendar"));
const person_1 = __importDefault(require("../models/person"));
class SMS {
    constructor() {
        this.twilio = (0, twilio_2.default)(SMS.config.accountSid, SMS.config.authToken);
        this.phone = SMS.config.phone;
    }
    static configure(config) {
        this.config = config;
    }
    static getInstance() {
        if (this.instance) {
            return this.instance;
        }
        this.instance = new SMS();
        return this.instance;
    }
    handleMessage(msg) {
        return __awaiter(this, void 0, void 0, function* () {
            let person = yield this.validateMessage(msg);
            let rsp = '';
            if (person.context == types_1.PersonContext.ASSIGNMENT) {
                rsp = yield this.handleAssignmentReply(msg, person);
            }
            else if (person.context == types_1.PersonContext.SCHEDULE_START) {
                rsp = yield this.handleScheduleStartReply(msg, person);
            }
            else if (person.context == types_1.PersonContext.SCHEDULE_AWAY) {
                rsp = yield this.handleScheduleAwayReply(msg, person);
            }
            else if (person.status == 'backup') {
                rsp = yield this.handleBackupMessages(msg, person);
            }
            else {
                yield this.relayToBackup(msg, person);
            }
            return rsp;
        });
    }
    handleAssignmentReply(msg, person) {
        return __awaiter(this, void 0, void 0, function* () {
            let sms = msg.Body.trim().toLowerCase();
            if (person.assignment && (sms == 'y' || sms == 'yes')) {
                person.assignment.status = 'done';
                yield person.assignment.save();
                return person_1.default.getAffirmation();
            }
            yield this.relayToBackup(msg, person);
            return '';
        });
    }
    handleBackupMessages(msg, person) {
        return __awaiter(this, void 0, void 0, function* () {
            let sms = msg.Body.trim().toLocaleLowerCase();
            if (sms == 'schedule') {
                yield this.scheduleStart();
            }
            return '';
        });
    }
    scheduleStart() {
        return __awaiter(this, void 0, void 0, function* () {
            let sheets = yield sheets_1.default.getInstance();
            let people = sheets.getActivePeople();
            for (let person of people) {
                person.context = types_1.PersonContext.SCHEDULE_START;
                yield this.sendMessage(person, 'It is time to schedule chicken tasks. Are there any days you will be away? [reply Y or N]');
            }
        });
    }
    handleScheduleStartReply(msg, person) {
        return __awaiter(this, void 0, void 0, function* () {
            let sms = msg.Body.trim().toLocaleLowerCase();
            let rsp = '';
            if (sms == 'y') {
                person.context = types_1.PersonContext.SCHEDULE_AWAY;
                rsp = 'Which days will you be away this week? [reply Mon, Tue or 6/17]';
            }
            else if (sms == 'n') {
                person.context = types_1.PersonContext.READY;
                rsp = 'Thank you, I will send your schedule as soon as I hear back from everyone.';
            }
            let ready = yield this.scheduleIfAllAreReady();
            if (ready) {
                rsp = '';
            }
            return rsp;
        });
    }
    handleScheduleAwayReply(msg, person) {
        return __awaiter(this, void 0, void 0, function* () {
            let sms = msg.Body.trim();
            let newDays = sms.split(',');
            let existingDays = person.away.split(', ');
            for (let day of newDays) {
                let isoDay = calendar_1.default.parseDay(day);
                if (!isoDay) {
                    throw new Error(`Sorry I couldn't make sense of '${day}' (away dates must be in the future). Please try again.`);
                }
                existingDays.push(isoDay);
            }
            let awayDays = yield person.updateAway(existingDays);
            person.context = types_1.PersonContext.READY;
            yield this.sendMessage(person, `Got it, your current away days are: ${awayDays}\n\nI will send your schedule as soon as I hear back from everyone.`);
            yield this.scheduleIfAllAreReady();
            return '';
        });
    }
    scheduleIfAllAreReady() {
        return __awaiter(this, void 0, void 0, function* () {
            let sheets = yield sheets_1.default.getInstance();
            let activePeople = sheets.getActivePeople();
            let readyPeople = activePeople.filter(p => p.context == types_1.PersonContext.READY);
            let allAreReady = activePeople.length == readyPeople.length;
            if (allAreReady) {
                let calendar = yield calendar_1.default.getInstance();
                calendar.scheduleTasks().then(this.scheduleSend.bind(this));
            }
            return allAreReady;
        });
    }
    scheduleSend() {
        return __awaiter(this, void 0, void 0, function* () {
            let sheets = yield sheets_1.default.getInstance();
            let people = sheets.getActivePeople();
            for (let person of people) {
                if (person.schedule) {
                    yield this.sendMessage(person, person.schedule);
                }
            }
        });
    }
    relayToBackup(msg, person) {
        return __awaiter(this, void 0, void 0, function* () {
            let sheets = yield sheets_1.default.getInstance();
            let backup = yield sheets.currentBackup();
            if (backup) {
                yield this.sendMessage(backup, `${person.name}: ${msg.Body}`);
            }
        });
    }
    relayErrorToBackup(msg, person, error) {
        return __awaiter(this, void 0, void 0, function* () {
            msg.Body = `${person.name}: ${msg.Body}\n${error.message}`;
            yield this.relayToBackup(msg, person);
        });
    }
    validateMessage(msg) {
        return __awaiter(this, void 0, void 0, function* () {
            let sheets = yield sheets_1.default.getInstance();
            if (msg.AccountSid !== config_1.default.twilio.accountSid) {
                throw new Error('Whoops, Twilio needs to be configured.');
            }
            let [person] = sheets.people.filter(p => msg.From == p.phone);
            if (!person) {
                throw new Error('Sorry, I don’t know who you are.');
            }
            return person;
        });
    }
    sendMessage(person, body) {
        return __awaiter(this, void 0, void 0, function* () {
            yield this.twilio.messages.create({
                from: this.phone,
                to: person.phone,
                body: body
            });
        });
    }
    messageResponse(reply, response) {
        let rsp = new twilio_1.twiml.MessagingResponse();
        rsp.message(response);
        reply.header('Content-Type', 'text/xml');
        return rsp.toString();
    }
}
exports.default = SMS;
//# sourceMappingURL=sms.js.map