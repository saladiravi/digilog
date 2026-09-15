const express = require("express");
const router = express.Router();

const expenditureController = require("../controller/expenditurecontroller");

router.post("/add", expenditureController.addExpenditure);

router.get("/list", expenditureController.getExpenditures);

router.get("/:expenditure_id", expenditureController.getExpenditureById);

router.put("/:expenditure_id", expenditureController.updateExpenditure);

router.delete("/:expenditure_id", expenditureController.deleteExpenditure);

module.exports = router;