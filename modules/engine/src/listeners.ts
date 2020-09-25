import { WithdrawCommitment } from "@connext/vector-contracts";
import {
  ChannelUpdateEvent,
  CreateUpdateDetails,
  FullChannelState,
  IChannelSigner,
  IMessagingService,
  IVectorProtocol,
  ProtocolEventName,
  UpdateType,
  WithdrawState,
} from "@connext/vector-types";
import { BigNumber } from "ethers";
import Pino from "pino";

export async function setupListeners(
  vector: IVectorProtocol,
  messaging: IMessagingService,
  signer: IChannelSigner,
  logger: Pino.BaseLogger = Pino(),
): Promise<void> {
  // Set up withdraw listener and handler
  vector.on(
    ProtocolEventName.CHANNEL_UPDATE_EVENT,
    event => handleWithdrawResolve(event, signer, vector, logger),
    event => {
      const {
        updatedChannelState: {
          latestUpdate: { toIdentifier, type, details },
          networkContext: { withdrawDefinition },
        },
      } = event;
      return (
        toIdentifier === signer.publicIdentifier &&
        type === UpdateType.create &&
        !!withdrawDefinition &&
        (details as CreateUpdateDetails).transferDefinition === withdrawDefinition
      );
    },
  );
}

async function handleWithdrawResolve(
  event: ChannelUpdateEvent,
  signer: IChannelSigner,
  vector: IVectorProtocol,
  logger: Pino.BaseLogger = Pino(),
): Promise<void> {
  // If you receive a withdraw from your counterparty, you should
  // resolve the withdrawal with your signature
  const {
    channelAddress,
    participants,
    latestUpdate: {
      details: { transferId, transferInitialState },
      assetId,
    },
  } = event.updatedChannelState as FullChannelState<typeof UpdateType.create>;

  // Get the recipient + amount from the transfer state
  const { balance, nonce } = transferInitialState as WithdrawState;

  // TODO: properly account for fees?
  const withdrawalAmount = balance.amount.reduce((prev, curr) => prev.add(curr), BigNumber.from(0));

  // TODO: should inject validation to make sure that a withdrawal transfer
  // is properly signed before its been merged into your channel
  const commitment = new WithdrawCommitment(
    channelAddress,
    participants,
    balance.to[0], // TODO: correct recipient
    assetId,
    withdrawalAmount.toString(),
    nonce,
  );

  // Generate your signature on the withdrawal commitment
  const responderSignature = await signer.signMessage(commitment.hashToSign());

  // Resolve the withdrawal
  const resolveRes = await vector.resolve({ transferResolver: { responderSignature }, transferId, channelAddress });

  // Handle the error
  if (resolveRes.isError) {
    logger.error(
      { method: "handleWithdrawResolve", error: resolveRes.getError()!.message, transferId, channelAddress },
      "Failed to resolve withdrawal",
    );
  }

  // Withdrawal successfully resolved
  logger.info({ channelAddress, amount: withdrawalAmount.toString(), assetId, transferId }, "Withdrawal resolved");
}