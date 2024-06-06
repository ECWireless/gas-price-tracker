import { Network, Alchemy } from "alchemy-sdk";
import { formatGwei } from "viem";
import { createObjectCsvWriter } from "csv-writer";
import "dotenv/config";

const NETWORKS_TO_TRACK = [
  Network.OPT_MAINNET,
  Network.BASE_MAINNET,
  Network.ARB_MAINNET,
  "redstone",
];

const REDSTONE_RPC_URL = "https://rpc.redstonechain.com";

const HEADERS = [
  { id: "date", title: "Date" },
  { id: "network", title: "Network" },
  { id: "gasPrice", title: "Gas Price (Gwei)" },
];

const CURRENT_DATE = new Date().toISOString().split("T")[0];
// const YESTERDAY_DATE = new Date(Date.now() - 86400000)
//   .toISOString()
//   .split("T")[0];

const getRedstoneGasPrice = async () => {
  console.log(`Fetching gas price for redstone...`);
  try {
    const response = await fetch(REDSTONE_RPC_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        method: "eth_gasPrice",
        params: [],
        id: 1,
      }),
    });

    const { result } = await response.json();

    return {
      date: CURRENT_DATE,
      network: "redstone",
      gasPrice: formatGwei(BigInt(result)),
    };
  } catch (error) {
    console.error(`Failed to fetch gas price for redstone`);
    return null;
  }
};

const getGasPrice = async (network: Network) => {
  console.log(`Fetching gas price for ${network}...`);
  try {
    const settings = {
      apiKey: process.env.ALCHEMY_API_KEY,
      network: network,
    };
    const alchemy = new Alchemy(settings);

    return alchemy.core.getGasPrice().then((price) => {
      return formatGwei(BigInt(price.toString()));
    });
  } catch (error) {
    console.error(`Failed to fetch gas price for ${network}`);
    return null;
  }
};

const outputGasPrice = async (network: Network) => {
  try {
    const gasPrice = await getGasPrice(network);

    if (!gasPrice) {
      return;
    }

    const record = {
      date: CURRENT_DATE,
      network,
      gasPrice,
    };

    const csvWriter = createObjectCsvWriter({
      path: `data/${network}_gasPrices.csv`, // e.g. `opt_mainnet_gasPrices.csv
      header: HEADERS,
    });

    await csvWriter.writeRecords([record]);
  } catch (error) {
    console.log(error);
    console.error(`Failed to fetch gas price for ${network}`);
  }
};

const outputGasPrices = async () => {
  console.log("Fetching gas prices...");
  await Promise.all(
    NETWORKS_TO_TRACK.map(async (network) => {
      if (network === "redstone") {
        const redstoneGasPrice = await getRedstoneGasPrice();
        if (!redstoneGasPrice) {
          return;
        }
        const csvWriter = createObjectCsvWriter({
          path: "data/redstone_gasPrices.csv",
          header: HEADERS,
        });
        await csvWriter.writeRecords([redstoneGasPrice]);
        return;
      }
      return outputGasPrice(network as Network);
    })
  );

  console.log("Gas Prices written to CSV files");
};

outputGasPrices();
