import { identifyHandler } from '../server/identify.ts';
import { withProviderKey } from '../server/access.ts';

export default withProviderKey(identifyHandler());
