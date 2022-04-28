/* eslint-disable max-len */
import * as functions from "firebase-functions";
import * as admin from "firebase-admin";

const app = admin.initializeApp();
const db = app.firestore();
const collVehicles = db.collection("veiculos");
const collDevices = db.collection("aparelhos");
const collFiscais = db.collection("fiscais");
const collIrregularidades = db.collection("irregularidades");

interface CallableResponse {
  status: string;
  message: string;
  payload: JSON;
}

type IrregularityTypes = "notPark" | "exceededTime";

const mappedTypes = {
  notPark: "vaga-proibida",
  exceededTime: "tempo-vencido",
};

const messageError =
  "Ops. Parece que aconteceu um problema aqui do nosso lado. Tente novamente. Se o problema persistir contate o suporte técnico pelo telefone 0800-000-0000";

const verifyPlate = (plate: string): boolean => {
  const regexPlate = /^[a-zA-Z]{3}[0-9]{4}$/;
  if (regexPlate.test(plate)) {
    return true;
  } else {
    return false;
  }
};

export const getUserAuth = functions
    .region("southamerica-east1")
    .https.onCall(async (data) => {
      const {deviceId} = data;
      const {docs, empty} = await collDevices
          .where("deviceId", "==", deviceId)
          .get();
      if (!empty) {
        try {
          const user = await admin.auth().getUser(docs[0].data().uid);
          return {
            status: "SUCCESS",
            message: "deu certo",
            payload: JSON.parse(
                JSON.stringify({
                  email: user.email,
                  password: "123456aB",
                })
            ),
          };
        } catch (error) {
          functions.logger.error("Erro ao buscar user");
          throw new functions.https.HttpsError("invalid-argument", messageError);
        }
      }
      functions.logger.error("Erro ao buscar user");
      throw new functions.https.HttpsError("invalid-argument", messageError);
    });

export const consultPlate = functions
    .region("southamerica-east1")
    .https.onCall(async (data) => {
      let result: CallableResponse;
      try {
        const {plate} = data;

        const verifiedPlate = verifyPlate(plate);

        if (!verifiedPlate) {
          functions.logger.error("Erro ao consultar - Placa inválida");
          throw new functions.https.HttpsError(
              "invalid-argument",
              "Placa invalida",
              {placa: plate}
          );
        }

        const {docs, empty} = await collVehicles
            .where("placa", "==", plate)
            .get();

        if (!empty) {
          const {placa, fim} = docs[0].data();
          const dateFim = new Date((fim._seconds - 10800) * 1000);
          const docInfo = {
            placaConsultada: plate,
          };

          if (plate === placa) {
            if (fim._seconds < Date.now() / 1000) {
              result = {
                status: "SUCCESS",
                message: "Veiculo não está regularizado.",
                payload: JSON.parse(
                    JSON.stringify({...docInfo, regularizado: false})
                ),
              };
            } else {
              result = {
                status: "SUCCESS",
                message: `Veículo regularizado até: ${
                  dateFim.getHours() + ":" + dateFim.getMinutes()
                } `,
                payload: JSON.parse(
                    JSON.stringify({...docInfo, regularizado: true})
                ),
              };
            }
            return result;
          }
        }
        result = {
          status: "SUCCESS",
          message: "Veiculo não foi encontrado.",
          payload: JSON.parse(
              JSON.stringify({placaConsultada: plate, regularizado: false})
          ),
        };
        return result;
      } catch (error) {
        functions.logger.error("Erro ao consultar");
        throw new functions.https.HttpsError("invalid-argument", messageError);
      }
    });

export const registerIrregularity = functions
    .region("southamerica-east1")
    .https.onCall(async (data, context) => {
      let result: CallableResponse;

      try {
        const {plate, imageOne, imageTwo, imageThree, imageFour, type} = data;

        const mappedType = mappedTypes[type as IrregularityTypes];

        if (context.auth?.uid) {
          const {docs, empty} = await collDevices
              .where("uid", "==", context.auth?.uid)
              .get();
          if (!empty) {
            const deviceRef = db.collection("aparelhos").doc(docs[0].id);
            const snapshot = await collFiscais
                .where("aparelho", "==", deviceRef)
                .get();
            if (!snapshot.empty) {
              const irregularityDto = {
                placa: plate,
                fotos: [imageOne, imageTwo, imageThree, imageFour],
                fiscal: snapshot.docs[0].ref,
                type: mappedType,
              };
              await collIrregularidades.add(irregularityDto);
              result = {
                status: "SUCCESS",
                message: "Irregularidade foi criada",
                payload: JSON.parse(JSON.stringify(irregularityDto)),
              };
            } else {
              functions.logger.error(
                  "Erro ao criar irregularidade - Fiscal não encontrado"
              );
              result = {
                status: "ERROR",
                message: "Fiscal não encontrado",
                payload: JSON.parse(JSON.stringify({placa: plate})),
              };
            }
          }
          functions.logger.error(
              "Erro ao consultar - Não foi possivel continuar"
          );
          result = {
            status: "ERROR",
            message: "Não foi possivel continuar",
            payload: JSON.parse(JSON.stringify({placa: plate})),
          };
        } else {
          functions.logger.error("Erro ao consultar - Usuario não autenticado");
          result = {
            status: "ERROR",
            message: "Usuario não autenticado",
            payload: JSON.parse(JSON.stringify({placa: plate})),
          };
        }

        return result;
      } catch (error) {
        functions.logger.error("Erro ao consultar");
        throw new functions.https.HttpsError("invalid-argument", messageError);
      }
    });
