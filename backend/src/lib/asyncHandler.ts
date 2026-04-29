import { Request, Response, NextFunction } from 'express';

type AsyncFn = (req: Request, res: Response, next: NextFunction) => Promise<void>;
export const asyncHandler = (fn: AsyncFn) =>
  (req: Request, res: Response, next: NextFunction) =>
    fn(req, res, next).catch(next);
