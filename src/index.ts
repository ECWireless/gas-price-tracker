import { Network, Alchemy } from "alchemy-sdk";
import { formatGwei } from "viem";
import { createObjectCsvWriter, createObjectCsvStringifier } from "csv-writer";
import csv from "csv-parser";
import fs from "fs";
import axios from "axios";
import "dotenv/config";

type GasPriceRecord = {
  date: string;
  network: string;
  gasPrice: string;
  ethPrice: string;
};

const NETWORKS_TO_TRACK = [
  Network.OPT_MAINNET,
  Network.BASE_MAINNET,
  Network.BASE_SEPOLIA,
  Network.ARB_MAINNET,
  Network.POLYGONZKEVM_MAINNET,
  "redstone",
];

const REDSTONE_RPC_URL = "https://rpc.redstonechain.com";

const HEADERS = [
  { id: "date", title: "Date" },
  { id: "network", title: "Network" },
  { id: "gasPrice", title: "Gas Price (Gwei)" },
  { id: "ethPrice", title: "ETH Price (USD)" },
];

const CURRENT_DATE = new Date().toISOString().split("T")[0];

const getEthPrice = async () => {
  try {
    const response = await axios.get(
      "https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd"
    );
    const ethPrice = response.data.ethereum.usd;
    console.log(`The current price of ETH is $${ethPrice}`);
    return ethPrice as string;
  } catch (error) {
    console.error("Error fetching ETH price:", error);
    return null;
  }
};

const readCsv = (filePath: string) => {
  return new Promise((resolve, _) => {
    const results: any[] = [];
    fs.createReadStream(filePath)
      .pipe(csv())
      .on("data", (data) => results.push(data))
      .on("end", () => {
        resolve(results);
      });
  });
};

const writeCsv = async (filePath: string, records: any) => {
  const csvWriter = createObjectCsvWriter({
    path: filePath,
    header: HEADERS,
  });

  await csvWriter.writeRecords(records);
};

const appendCsv = async (filePath: string, record: any) => {
  const csvStringifier = createObjectCsvStringifier({
    header: HEADERS,
  });

  const csvLine = csvStringifier.stringifyRecords([record]);
  fs.appendFileSync(filePath, csvLine);
};

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

    return formatGwei(BigInt(result));
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

const outputGasPrice = async (
  network: Network | "redstone",
  ethPrice: string
) => {
  try {
    let gasPriceRecord: GasPriceRecord | null = null;

    if (network === "redstone") {
      const redstoneGasPrice = await getRedstoneGasPrice();

      if (!redstoneGasPrice) {
        return;
      }

      gasPriceRecord = {
        date: CURRENT_DATE,
        network,
        gasPrice: redstoneGasPrice,
        ethPrice,
      };
    } else {
      const gasPrice = await getGasPrice(network);

      if (!gasPrice) {
        return;
      }

      gasPriceRecord = {
        date: CURRENT_DATE,
        network,
        gasPrice,
        ethPrice,
      };
    }

    if (!gasPriceRecord) {
      return;
    }

    const filePath = `data/${network}_gasPrices.csv`;

    if (fs.existsSync(filePath)) {
      await readCsv(filePath).then((records: any) => {
        const mappedRecords = records.map((record: any) => {
          return {
            date: record["Date"],
            network: record["Network"],
            gasPrice: record["Gas Price (Gwei)"],
            ethPrice: record["ETH Price (USD)"],
          };
        });

        if (
          mappedRecords.length > 0 &&
          mappedRecords[mappedRecords.length - 1].date === CURRENT_DATE
        ) {
          // Overwrite the last entry
          mappedRecords[mappedRecords.length - 1] = gasPriceRecord;
          return writeCsv(filePath, mappedRecords);
        } else {
          // Append a new entry
          return appendCsv(filePath, gasPriceRecord);
        }
      });
    } else {
      return writeCsv(filePath, [gasPriceRecord]);
    }
  } catch (error) {
    console.log(error);
    console.error(`Failed to fetch gas price for ${network}`);
  }
};

const outputGasPrices = async () => {
  console.log("Fetching gas prices...");
  const currentEthPrice = await getEthPrice();
  if (!currentEthPrice) return;

  await Promise.all(
    NETWORKS_TO_TRACK.map(async (network) =>
      outputGasPrice(network as Network, currentEthPrice)
    )
  );

  console.log("Gas Prices written to CSV files");
};

outputGasPrices();
