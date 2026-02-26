import * as fs from "fs/promises";

export async function getDatasFromResultPrivileges(filePath: string) {
  const data = (await fs.readFile(filePath, "utf-8")).toString();
  const mongosDbRepo: any = [];
  data.split("---").forEach((dbrepo) => {
    let dat: any = {};
    dbrepo.split("\n").forEach((dt: any) => {
      if (dt.includes("REPO:")) {
        dat.repo = dt.split("REPO:").pop().replaceAll(" ", "");
      }
      if (dt.includes("URI:")) {
        dat.uri = dt.split("URI:").pop().replaceAll(" ", "");
      }
    });
    if (dat.uri && dat.repo) mongosDbRepo.push(dat);
  });
  return mongosDbRepo;
}

// getDatasFromResultPrivileges("privileges_report.txt");
