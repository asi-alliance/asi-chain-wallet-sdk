import NodeApiAdapter from "@domains/NodeApiAdapter";
import { NodeApiProfile } from "@domains/NodeApiProfile";

export default class ScalaNodeApiAdapter extends NodeApiAdapter {
    public getProfile(): NodeApiProfile {
        return NodeApiProfile.SCALA;
    }
}
