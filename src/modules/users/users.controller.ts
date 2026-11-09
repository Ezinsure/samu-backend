import type { Request, RequestHandler } from "express";
import { errors } from "../../lib/errors.js";
import * as coaImport from "./coa-import.service.js";
import {
  setPasswordSchema,
  userCreateSchema,
  userIdParamSchema,
  userListQuerySchema,
  userUpdateSchema,
} from "./users.schemas.js";
import * as usersService from "./users.service.js";

/** Request metadata recorded on audit rows. */
function requestMeta(req: Request) {
  return { ip: req.ip, userAgent: req.get("user-agent") ?? undefined };
}

/** GET /api/v1/users — paginated list (Admin). */
export const list: RequestHandler = async (req, res, next) => {
  try {
    if (!req.user) throw errors.unauthorized();
    const query = userListQuerySchema.parse(req.query);
    const result = await usersService.listUsers(query, req.user);
    res.setHeader("Cache-Control", "private, no-store");
    res.json({ data: result.data, meta: result.meta });
  } catch (error) {
    next(error);
  }
};

/** GET /api/v1/users/:id */
export const getById: RequestHandler = async (req, res, next) => {
  try {
    if (!req.user) throw errors.unauthorized();
    const { id } = userIdParamSchema.parse(req.params);
    const user = await usersService.getUser(id, req.user);
    res.setHeader("Cache-Control", "private, no-store");
    res.json({ data: { user } });
  } catch (error) {
    next(error);
  }
};

/** POST /api/v1/users — create an account; `invite` reports the email outcome. */
export const create: RequestHandler = async (req, res, next) => {
  try {
    if (!req.user) throw errors.unauthorized();
    const body = userCreateSchema.parse(req.body);
    const result = await usersService.createUser(body, req.user, requestMeta(req));
    res.status(201).json({ data: result });
  } catch (error) {
    next(error);
  }
};

/** GET /api/v1/users/coa-import-template.csv — sample CSV for COA bulk import. */
export const downloadCoaImportTemplate: RequestHandler = async (req, res, next) => {
  try {
    if (!req.user) throw errors.unauthorized();
    if (req.user.role !== "ADMIN") throw errors.forbidden();
    const csv = coaImport.coaImportTemplateCsv();
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader(
      "Content-Disposition",
      'attachment; filename="coa-import-template.csv"',
    );
    res.send(csv);
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/v1/users/import-coas — Excel/CSV bulk provision of COA accounts
 * with Resend set-password invites.
 */
export const importCoas: RequestHandler = async (req, res, next) => {
  try {
    if (!req.user) throw errors.unauthorized();
    const file = req.file;
    if (!file) {
      throw errors.badRequest("Attach a CSV or Excel file as field `file`");
    }
    const result = await coaImport.importCoaAccounts(
      {
        buffer: file.buffer,
        originalname: file.originalname || "import.csv",
        size: file.size,
      },
      req.user,
      requestMeta(req),
    );
    res.status(201).json({ data: result });
  } catch (error) {
    next(error);
  }
};

/** PATCH /api/v1/users/:id — edit profile, role, status (deactivate/reactivate). */
export const update: RequestHandler = async (req, res, next) => {
  try {
    if (!req.user) throw errors.unauthorized();
    const { id } = userIdParamSchema.parse(req.params);
    const body = userUpdateSchema.parse(req.body);
    const user = await usersService.updateUser(id, body, req.user, requestMeta(req));
    res.json({ data: { user } });
  } catch (error) {
    next(error);
  }
};

/** POST /api/v1/users/:id/password — admin sets a password directly. */
export const setPassword: RequestHandler = async (req, res, next) => {
  try {
    if (!req.user) throw errors.unauthorized();
    const { id } = userIdParamSchema.parse(req.params);
    const { password } = setPasswordSchema.parse(req.body);
    await usersService.setUserPassword(id, password, req.user, requestMeta(req));
    res.json({ data: { ok: true } });
  } catch (error) {
    next(error);
  }
};

/** POST /api/v1/users/:id/reset-link — email the user a reset link. */
export const sendResetLink: RequestHandler = async (req, res, next) => {
  try {
    if (!req.user) throw errors.unauthorized();
    const { id } = userIdParamSchema.parse(req.params);
    const result = await usersService.sendUserResetLink(id, req.user, requestMeta(req));
    res.json({ data: result });
  } catch (error) {
    next(error);
  }
};

/** DELETE /api/v1/users/:id — hard delete when the user has no history. */
export const remove: RequestHandler = async (req, res, next) => {
  try {
    if (!req.user) throw errors.unauthorized();
    const { id } = userIdParamSchema.parse(req.params);
    await usersService.deleteUser(id, req.user, requestMeta(req));
    res.json({ data: { ok: true } });
  } catch (error) {
    next(error);
  }
};
