import { BrowserNode } from "@connext/vector-browser-node";
import { ChannelSigner, getBalanceForAssetId, getRandomBytes32 } from "@connext/vector-utils";
import React, { useEffect, useState } from "react";
import pino from "pino";
import { Wallet, constants } from "ethers";
import { Col, Divider, Row, Statistic, Input, Typography, Table, Form, Button, Select } from "antd";

import "./App.css";
import { EngineEvents, FullChannelState } from "@connext/vector-types";

import { config } from "./config";
import Axios from "axios";

const logger = pino();

const storedMnemonic = localStorage.getItem("mnemonic");

function App() {
  const [node, setNode] = useState<BrowserNode>();
  const [channel, setChannel] = useState<FullChannelState>();
  const [mnemonic, setMnemonic] = useState<string>();
  const [counterpartyConfig, setCounterpartyConfig] = useState<string>();

  const [setupLoading, setSetupLoading] = useState<boolean>(false);
  const [connectLoading, setConnectLoading] = useState<boolean>(false);
  const [depositLoading, setDepositLoading] = useState<boolean>(false);
  const [requestCollateralLoading, setRequestCollateralLoading] = useState<boolean>(false);
  const [transferLoading, setTransferLoading] = useState<boolean>(false);
  const [withdrawLoading, setWithdrawLoading] = useState<boolean>(false);

  const [connectError, setConnectError] = useState<string>();

  const [withdrawForm] = Form.useForm();
  const [transferForm] = Form.useForm();

  useEffect(() => {
    const init = async () => {
      if (!storedMnemonic) {
        return;
      }
      console.log("Found stored mnemonic, hydrating node");
      await connectNode(storedMnemonic);
    };
    init();
  }, []);

  const connectNode = async (mnemonic: string) => {
    console.log(config);
    try {
      setConnectLoading(true);
      const wallet = Wallet.fromMnemonic(mnemonic);
      const signer = new ChannelSigner(wallet.privateKey);
      const client = await BrowserNode.connect({
        chainAddresses: config.chainAddresses,
        chainProviders: config.chainProviders,
        logger,
        authUrl: config.authUrl, // optional, only for local setups
        natsUrl: config.natsUrl, // optional, only for local setups
        messagingUrl: config.messagingUrl, // used in place of authUrl + natsUrl in prod setups
        signer,
      });
      const channelsRes = await client.getStateChannels();
      if (channelsRes.isError) {
        setConnectError(channelsRes.getError().message);
        return;
      }
      const _channel = channelsRes.getValue()[0];
      const channelRes = await client.getStateChannel({ channelAddress: _channel });
      console.log("channel: ", channelRes.getValue());
      setChannel(channelRes.getValue());
      setNode(client);
      localStorage.setItem("mnemonic", mnemonic);
      client.on(EngineEvents.DEPOSIT_RECONCILED, async data => {
        console.log("Received EngineEvents.DEPOSIT_RECONCILED: ", data);
        await updateChannel(client);
      });
    } catch (e) {
      console.error("Error connecting node: ", e);
      setConnectError(e.message);
    } finally {
      setConnectLoading(false);
    }
  };

  const updateChannel = async (node: BrowserNode) => {
    if (!channel) {
      return;
    }
    const res = await node.getStateChannel({ channelAddress: channel.channelAddress });
    if (res.isError) {
      console.error("Error getting state channel", res.getError());
    } else {
      console.log("Updated channel:", res.getValue());
      setChannel(res.getValue());
    }
  };

  const setupChannel = async (aliceIdentifier: string, counterpartyUrl: string) => {
    const setupRes = await node.requestSetup({
      aliceIdentifier,
      aliceUrl: counterpartyUrl,
      chainId: 1337,
      timeout: "100000",
    });
    if (setupRes.isError) {
      console.error(setupRes.getError());
    } else {
      setChannel(setupRes.getValue() as FullChannelState);
    }
  };

  const reconcileDeposit = async (assetId: string) => {
    setDepositLoading(true);
    const depositRes = await node.reconcileDeposit({
      channelAddress: channel.channelAddress,
      assetId,
    });
    if (depositRes.isError) {
      console.error("Error depositing", depositRes.getError());
    }
    setDepositLoading(false);
  };

  const requestCollateral = async (assetId: string) => {
    setRequestCollateralLoading(true);
    const requestRes = await node.requestCollateral({
      channelAddress: channel.channelAddress,
      assetId,
    });
    if (requestRes.isError) {
      console.error("Error depositing", requestRes.getError());
    }
    setRequestCollateralLoading(false);
  };

  const transfer = async (assetId: string, amount: string, recipient: string) => {
    setTransferLoading(true);
    const requestRes = await node.withdraw({
      channelAddress: channel.channelAddress,
      assetId,
      amount,
      recipient,
    });
    if (requestRes.isError) {
      console.error("Error withdrawing", requestRes.getError());
    }
    setTransferLoading(false);
  };

  const withdraw = async (assetId: string, amount: string, recipient: string) => {
    setWithdrawLoading(true);
    const requestRes = await node.withdraw({
      channelAddress: channel.channelAddress,
      assetId,
      amount,
      recipient,
    });
    if (requestRes.isError) {
      console.error("Error withdrawing", requestRes.getError());
    }
    setWithdrawLoading(false);
  };

  const onFinishFailed = (errorInfo: any) => {
    console.log("Failed:", errorInfo);
  };

  return (
    <div style={{ margin: 36 }}>
      <Typography.Title>Vector Browser Node</Typography.Title>
      <Divider orientation="left">Connection</Divider>
      <Row gutter={16}>
        {node?.publicIdentifier ? (
          <>
            <Row>
              <Statistic title="Public Identifier" value={node!.publicIdentifier} />
            </Row>{" "}
            <Row>
              <Statistic title="Signer Address" value={node!.signerAddress} />
            </Row>
          </>
        ) : connectError ? (
          <Statistic title="Error Connecting Node" value={connectError} />
        ) : (
          <>
            <Col span={16}>
              <Input.Search
                placeholder="Mnemonic"
                enterButton="Setup Node"
                size="large"
                value={mnemonic}
                onSearch={connectNode}
                loading={connectLoading}
              />
            </Col>
            <Col span={8}>
              <Button type="primary" size="large" onClick={() => setMnemonic(Wallet.createRandom().mnemonic.phrase)}>
                Generate Random Mnemonic
              </Button>
            </Col>
          </>
        )}
      </Row>
      {node?.publicIdentifier && (
        <>
          <Divider orientation="left">Channel</Divider>
          <Row gutter={16}>
            <Col span={24}>
              {channel ? (
                <Statistic title="Channel Address" value={channel.channelAddress} />
              ) : (
                <Form
                  labelCol={{ span: 6 }}
                  wrapperCol={{ span: 16 }}
                  name="basic"
                  initialValues={{}}
                  onFinish={async (values: { counterpartyUrl: string; counterpartyIdentifier: string }) => {
                    setSetupLoading(true);
                    await setupChannel(values.counterpartyIdentifier, values.counterpartyUrl);
                    setSetupLoading(false);
                  }}
                  onFinishFailed={onFinishFailed}
                >
                  <Form.Item
                    label="Counterparty URL"
                    name="counterpartyUrl"
                    rules={[{ required: true, message: "Please enter counterparty URL" }]}
                  >
                    <Input.Search
                      onSearch={async value => {
                        try {
                          const config = await Axios.get(`${value}/config`);
                          setCounterpartyConfig(JSON.stringify(config.data, null, 2));
                        } catch (e) {
                          console.error("Error getting config from counterparty:", e);
                        }
                      }}
                      enterButton="Get Config"
                    />
                  </Form.Item>

                  {counterpartyConfig && (
                    <Form.Item label="Counterparty Config">
                      <Typography.Text code>{counterpartyConfig}</Typography.Text>
                    </Form.Item>
                  )}

                  <Form.Item
                    label="Counterparty Public Identifier"
                    name="counterpartyIdentifier"
                    rules={[{ required: true, message: "Please enter counterparty public identifier (i.e. indra...)" }]}
                  >
                    <Input />
                  </Form.Item>

                  <Form.Item wrapperCol={{ span: 6, offset: 6 }}>
                    <Button type="primary" htmlType="submit" loading={setupLoading}>
                      Setup
                    </Button>
                  </Form.Item>
                </Form>
              )}
            </Col>
          </Row>

          <Divider orientation="left">Balance & Deposit</Divider>
          <Row gutter={16}>
            {channel && channel.assetIds && (
              <Col span={24}>
                <Table
                  dataSource={channel.assetIds.map((assetId, index) => {
                    return {
                      key: index,
                      assetId,
                      counterpartyBalance: channel.balances[index].amount[0], // they are Alice
                      myBalance: channel.balances[index].amount[1], // we are Bob
                    };
                  })}
                  columns={[
                    {
                      title: "Asset ID",
                      dataIndex: "assetId",
                      key: "assetId",
                    },
                    {
                      title: "My Balance",
                      dataIndex: "myBalance",
                      key: "myBalance",
                    },
                    {
                      title: "Counterparty Balance",
                      dataIndex: "counterpartyBalance",
                      key: "counterpartyBalance",
                    },
                  ]}
                />
              </Col>
            )}
          </Row>
          <Row gutter={16}>
            <Col span={24}>
              <Form layout="horizontal" name="deposit" wrapperCol={{ span: 18 }} labelCol={{ span: 6 }}>
                <Form.Item label="Reconcile Deposit">
                  <Input.Search
                    placeholder={constants.AddressZero}
                    enterButton="Reconcile"
                    suffix="Asset ID"
                    onSearch={assetId => reconcileDeposit(assetId || constants.AddressZero)}
                    loading={depositLoading}
                  />
                </Form.Item>
                <Form.Item label="Request Collateral">
                  <Input.Search
                    placeholder={constants.AddressZero}
                    enterButton="Request"
                    suffix="Asset ID"
                    onSearch={assetId => requestCollateral(assetId || constants.AddressZero)}
                    loading={requestCollateralLoading}
                  />
                </Form.Item>
              </Form>
            </Col>
          </Row>

          <Divider orientation="left">Transfer</Divider>
          <Row gutter={16}>
            <Col span={24}>
              <Form
                layout="horizontal"
                labelCol={{ span: 6 }}
                wrapperCol={{ span: 18 }}
                name="transfer"
                initialValues={{ assetId: channel?.assetIds[0], preImage: getRandomBytes32() }}
                onFinish={values => transfer(values.assetId, values.amount, values.recipient)}
                onFinishFailed={onFinishFailed}
                form={transferForm}
              >
                <Form.Item label="Asset ID" name="assetId">
                  <Select>
                    {channel?.assetIds.map(aid => {
                      return (
                        <Select.Option key={aid} value={aid}>
                          {aid}
                        </Select.Option>
                      );
                    })}
                  </Select>
                </Form.Item>

                <Form.Item
                  label="Recipient"
                  name="recipient"
                  rules={[{ required: true, message: "Please input recipient address" }]}
                >
                  <Input />
                </Form.Item>

                <Form.Item
                  label="Amount"
                  name="amount"
                  rules={[{ required: true, message: "Please input transfer amount" }]}
                >
                  <Input.Search
                    enterButton="MAX"
                    onSearch={() => {
                      const assetId = transferForm.getFieldValue("assetId");
                      const amount = getBalanceForAssetId(channel, assetId, "bob");
                      transferForm.setFieldsValue({ amount });
                    }}
                  />
                </Form.Item>

                <Form.Item
                  label="Pre Image"
                  name="preImage"
                  rules={[{ required: true, message: "Please input pre image" }]}
                >
                  <Input.Search
                    enterButton="Random"
                    onSearch={() => {
                      const preImage = getRandomBytes32();
                      transferForm.setFieldsValue({ preImage });
                    }}
                  />
                </Form.Item>

                <Form.Item label="Recipient Chain ID" name="recipientChainId">
                  <Input />
                </Form.Item>

                <Form.Item label="Recipient Asset ID" name="recipientAssetId">
                  <Input />
                </Form.Item>

                <Form.Item wrapperCol={{ offset: 6 }}>
                  <Button type="primary" htmlType="submit" loading={transferLoading}>
                    Transfer
                  </Button>
                </Form.Item>
              </Form>
            </Col>
          </Row>

          <Divider orientation="left">Withdraw</Divider>
          <Row gutter={16}>
            <Col span={24}>
              <Form
                layout="horizontal"
                labelCol={{ span: 6 }}
                wrapperCol={{ span: 18 }}
                name="withdraw"
                initialValues={{ assetId: channel?.assetIds[0], recipient: channel?.bob }}
                onFinish={values => withdraw(values.assetId, values.amount, values.recipient)}
                onFinishFailed={onFinishFailed}
                form={withdrawForm}
              >
                <Form.Item label="Asset ID" name="assetId">
                  <Select>
                    {channel?.assetIds.map(aid => {
                      return (
                        <Select.Option key={aid} value={aid}>
                          {aid}
                        </Select.Option>
                      );
                    })}
                  </Select>
                </Form.Item>

                <Form.Item
                  label="Recipient"
                  name="recipient"
                  rules={[{ required: true, message: "Please input recipient address" }]}
                >
                  <Input />
                </Form.Item>

                <Form.Item
                  label="Amount"
                  name="amount"
                  rules={[{ required: true, message: "Please input withdrawal amount" }]}
                >
                  <Input.Search
                    enterButton="MAX"
                    onSearch={() => {
                      const assetId = withdrawForm.getFieldValue("assetId");
                      const amount = getBalanceForAssetId(channel, assetId, "bob");
                      withdrawForm.setFieldsValue({ amount });
                    }}
                  />
                </Form.Item>

                <Form.Item wrapperCol={{ offset: 6 }}>
                  <Button type="primary" htmlType="submit" loading={withdrawLoading}>
                    Withdraw
                  </Button>
                </Form.Item>
              </Form>
            </Col>
          </Row>
        </>
      )}
    </div>
  );
}

export default App;
