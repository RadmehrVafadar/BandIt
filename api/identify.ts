import { identifyHandler } from '../server/identify.ts';

export default identifyHandler(process.env.GEMINI_API_KEY);
