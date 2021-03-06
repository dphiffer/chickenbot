"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.init = void 0;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const fastify_1 = __importDefault(require("fastify"));
const view_1 = __importDefault(require("@fastify/view"));
const formbody_1 = __importDefault(require("@fastify/formbody"));
const static_1 = __importDefault(require("@fastify/static"));
const routes_1 = __importDefault(require("./routes"));
const sheets_1 = __importDefault(require("./controllers/sheets"));
const calendar_1 = __importDefault(require("./controllers/calendar"));
const messages_1 = __importDefault(require("./controllers/messages"));
const voice_1 = __importDefault(require("./controllers/voice"));
const configPath = `${path_1.default.dirname(__dirname)}/config/config.json`;
const config = JSON.parse(fs_1.default.readFileSync(configPath, 'utf8'));
const app = (0, fastify_1.default)({
    logger: config.logger,
});
app.register(formbody_1.default);
app.register(view_1.default, {
    engine: {
        ejs: require('ejs'),
    },
    root: path_1.default.join(path_1.default.dirname(__dirname), 'views'),
    layout: 'layout.ejs',
    defaultContext: {
        url: config.url,
    },
});
app.register(static_1.default, {
    root: path_1.default.join(path_1.default.dirname(__dirname), 'public'),
});
app.register(routes_1.default);
async function init() {
    sheets_1.default.configure(config.google);
    messages_1.default.configure(config.twilio);
    voice_1.default.configure(config.twilio);
    calendar_1.default.configure(config.calendar);
    let sheets = await sheets_1.default.getInstance();
    await sheets.setup();
    let calendar = await calendar_1.default.getInstance();
    await calendar.setup();
}
exports.init = init;
exports.default = app;
//# sourceMappingURL=app.js.map