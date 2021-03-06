"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AssignmentStatus = void 0;
const moment = __importStar(require("moment-timezone"));
const sheets_1 = __importDefault(require("../controllers/sheets"));
const messages_1 = __importDefault(require("../controllers/messages"));
var AssignmentStatus;
(function (AssignmentStatus) {
    AssignmentStatus["SCHEDULED"] = "scheduled";
    AssignmentStatus["PENDING"] = "pending";
    AssignmentStatus["DONE"] = "done";
})(AssignmentStatus = exports.AssignmentStatus || (exports.AssignmentStatus = {}));
class Assignment {
    constructor(sheet, data) {
        this.timeout = null;
        this.sheet = sheet;
        this.date = data.date;
        this.time = data.time;
        this.task = data.task;
        this.person = data.person;
        this.status = data.status;
    }
    get isoDate() {
        return moment.default(this.date, 'M/D').format('YYYY-MM-DD');
    }
    async setPending() {
        this.status = AssignmentStatus.PENDING;
        await this.save();
        this.timeout = setTimeout(async () => {
            let messages = messages_1.default.getInstance();
            let sheets = await sheets_1.default.getInstance();
            let backup = await sheets.currentBackup();
            if (backup) {
                messages.sendMessage(backup, `Still pending after one hour: ${this.task}, assigned to ${this.person}.`);
            }
        }, 60 * 60 * 1000);
    }
    async setDone() {
        this.status = AssignmentStatus.DONE;
        this.time = moment.default().format('h:mm A');
        await this.save();
        if (this.timeout) {
            clearTimeout(this.timeout);
            this.timeout = null;
        }
    }
    async snooze() {
        this.status = AssignmentStatus.SCHEDULED;
        this.time = moment.default().add('1', 'hours').format('h:mm A');
        await this.save();
        if (this.timeout) {
            clearTimeout(this.timeout);
            this.timeout = null;
        }
        return this.time;
    }
    async save() {
        let sheets = await sheets_1.default.getInstance();
        let sheet = sheets.doc.sheetsByTitle[this.sheet];
        let rows = await sheet.getRows();
        let id = `${this.date} ${this.task}`;
        for (let row of rows) {
            if (id == `${row.date} ${row.task}`) {
                row.time = this.time;
                row.person = this.person;
                row.status = this.status;
                await row.save();
            }
        }
    }
}
exports.default = Assignment;
//# sourceMappingURL=assignment.js.map