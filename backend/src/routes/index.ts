import { Router, type Router as ExpressRouter } from 'express'
import { notesRouter } from './notes'

const router: ExpressRouter = Router()

router.use('/notes', notesRouter)

export { router as apiRouter }