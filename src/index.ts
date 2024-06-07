import { Network, Alchemy } from "alchemy-sdk";
import { formatGwei } from "viem";
import { createObjectCsvWriter, createObjectCsvStringifier } from "csv-writer";
import csv from "csv-parser";
import fs from "fs";
import "dotenv/config";

type GasPriceRecord = {
  date: string;
  network: string;
  gasPrice: string;
};

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

const outputGasPrice = async (network: Network | "redstone") => {
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
  await Promise.all(
    NETWORKS_TO_TRACK.map(async (network) => outputGasPrice(network as Network))
  );

  console.log("Gas Prices written to CSV files");
};

outputGasPrices();
