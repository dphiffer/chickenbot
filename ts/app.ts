import config from './config';
import Fastify from 'fastify';
import formBodyPlugin from '@fastify/formbody';
import moment from 'moment-timezone';
import routes from './routes';
import Sheets from './sheets';
import Calendar from './calendar';
import SMS from './sms';

const app = Fastify({
    logger: config.logger
});
app.register(formBodyPlugin);
app.register(routes);

(async () => {
    let sheets = await Sheets.getInstance(config.google);
    SMS.getInstance(config.twilio, sheets);
    Calendar.getInstance(config.calendar, sheets);
})();

export default app;