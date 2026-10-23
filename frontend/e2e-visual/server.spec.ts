import { serverUrl, test } from "./fixtures";
import { checkScreens } from "./screens";
import { serverScreens } from "./server.screens";

test.use({ baseURL: serverUrl });

checkScreens(serverScreens);
