import {
  ChannelSigner,
  getRandomChannelSigner,
  createTestChannelUpdateWithSigners,
  createVectorChannelMessage,
  createVectorErrorMessage,
} from "@connext/vector-utils";
import {
  IEngineStore,
  IMessagingService,
  FullChannelState,
  ChannelUpdateError,
  UpdateType,
} from "@connext/vector-types";
import { Evt } from "evt";
import { expect } from "chai";

import { inbound } from "../sync";

import { config } from "./services/config";
import { MemoryStoreService } from "./services/store";
import { MemoryMessagingService } from "./services/messaging";

describe.only("inbound", () => {
  const chainProviders = config.chainProviders;
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [chainIdStr, providerUrl] = Object.entries(chainProviders)[0] as string[];
  const stateEvt = new Evt<FullChannelState>();
  const errorEvt = new Evt<ChannelUpdateError>();

  let signers: ChannelSigner[];
  let store: IEngineStore;
  let messaging: IMessagingService;

  beforeEach(async () => {
    signers = Array(2)
      .fill(0)
      .map((v) => getRandomChannelSigner(providerUrl));
    store = new MemoryStoreService();
    messaging = new MemoryMessagingService();
  });

  it("should return undefined if message is from us", async () => {
    const message = createVectorChannelMessage({ from: signers[0].publicIdentifier });
    const res = await inbound(message, store, messaging, signers[0], chainProviders, stateEvt, errorEvt);
    expect(res.isError).to.be.false;
    expect(res.getValue()).to.be.undefined;
  });

  it("should return undefined if message is malformed", async () => {
    const message = { should: "fail" } as any;
    const res = await inbound(message, store, messaging, signers[0], chainProviders, stateEvt, errorEvt);
    expect(res.isError).to.be.false;
    expect(res.getValue()).to.be.undefined;
  });

  it("should post to evt if receives an error message", async () => {
    const message = createVectorErrorMessage();
    const [event, res] = await Promise.all([
      errorEvt.waitFor((e) => e.message === message.error.message, 5_000),
      inbound(message, store, messaging, signers[0], chainProviders, stateEvt, errorEvt),
    ]);
    expect(res.isError).to.be.true;
    expect(event).to.be.instanceOf(ChannelUpdateError);
    expect(event).to.containSubset(message.error);
  });

  it("should work if there is no channel state stored and you are receiving a setup update", async () => {
    const update = createTestChannelUpdateWithSigners(signers, UpdateType.setup);
    const message = createVectorChannelMessage({
      from: signers[0].publicIdentifier,
      to: signers[1].publicIdentifier,
      data: { update },
    });
    const [event, res] = await Promise.all([
      stateEvt.waitFor((e) => e.channelAddress === update.channelAddress, 5_000),
      inbound(message, store, messaging, signers[1], chainProviders, stateEvt, errorEvt),
    ]);
    expect(res.isError).to.be.false;

    // make sure whats in the store lines up with whats emitted
    const storedState = await store.getChannelState(update.channelAddress);
    const storedCommitment = await store.getChannelCommitment(update.channelAddress);

    // TODO: stronger assertions!
    expect(storedState).to.containSubset(event);
    expect(storedCommitment).to.be.ok;
  });

  // it("should return an error if the update is behind", async () => {});

  // it("should work if stored state is behind (update nonce = stored nonce + 2)", async () => {});

  // it("should update if stored state is in sync", async () => {});
});