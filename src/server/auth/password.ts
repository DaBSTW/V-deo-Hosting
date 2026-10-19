import bcrypt from "bcryptjs";

const COST = 12;

export const hashPassword = (plain: string) => bcrypt.hash(plain, COST);
export const verifyPassword = (plain: string, hash: string) => bcrypt.compare(plain, hash);

// Hash ficticio para igualar tiempos cuando el email no existe (anti-enumeración).
const DUMMY_HASH = bcrypt.hashSync("dummy-password-for-timing", COST);
export const burnPasswordCheck = (plain: string) => bcrypt.compare(plain, DUMMY_HASH);
