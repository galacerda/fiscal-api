import * as functions from "firebase-functions";
import * as admin from "firebase-admin";

const app = admin.initializeApp();
const db = app.firestore();
const collVehicles = db.collection("veiculos");

interface CallableResponse {
  status: string;
  message: string;
  payload: JSON;
}

const verifyPlate = (plate: string): boolean => {
  const regexPlate = /^[a-zA-Z]{3}[0-9]{4}$/;
  if (regexPlate.test(plate)) {
    return true;
  } else {
    return false;
  }
};

export const consultPlate = functions
    .region("southamerica-east1")
    .https.onCall(async (data) => {
      let result: CallableResponse;
      const {plate} = data;

      const verifiedPlate = verifyPlate(plate);

      if (!verifiedPlate) {
        functions.logger.error("Erro ao consultar placa");
        result = {
          status: "ERROR",
          message: "Placa inválida",
          payload: JSON.parse(JSON.stringify({placa: plate})),
        };
        return result;
      }

      const {docs, empty} = await collVehicles
          .where("placa", "==", plate)
          .get();

      if (empty) {
        functions.logger.error("Erro ao consultar placa");
        result = {
          status: "ERROR",
          message: "Placa não encontrada",
          payload: JSON.parse(JSON.stringify({placaConsultada: plate})),
        };
        return result;
      }

      const {placa, fim, inicio} = docs[0].data();

      const docInfo = {
        placaConsultada: plate,
        inicio: new Date((inicio._seconds - 10800) * 1000).toISOString(),
        fim: new Date((fim._seconds - 10800) * 1000).toISOString(),
      };

      if (plate === placa) {
        if (fim._seconds < Date.now() / 1000) {
          result = {
            status: "SUCCESS",
            message: "MULTA ESSE SAFADO AGORA",
            payload: JSON.parse(
                JSON.stringify({...docInfo, regularizado: false})
            ),
          };
        } else {
          result = {
            status: "SUCCESS",
            message: "VOCÊ ESTÁ LIBERADO",
            payload: JSON.parse(
                JSON.stringify({...docInfo, regularizado: true})
            ),
          };
        }
        return result;
      }
      result = {
        status: "SUCCESS",
        message: "Produto inserido com sucesso.",
        payload: JSON.parse(JSON.stringify(docInfo)),
      };
      return result;
    });
