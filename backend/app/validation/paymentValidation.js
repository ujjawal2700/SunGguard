import Joi from "joi";

const objectIdOrPublicOrderSchema = Joi.string().trim().min(8).max(64).required();

export const createPaymentOrderSchema = Joi.object({
  orderRef: objectIdOrPublicOrderSchema.optional(),
  orderId: objectIdOrPublicOrderSchema.optional(),
}).or("orderRef", "orderId");

/**
 * The receipt Razorpay checkout hands back. All three parts are required:
 * the signature is computed over the order and payment ids, so a receipt
 * missing any of them cannot be checked at all.
 */
export const verifyCheckoutReceiptSchema = Joi.object({
  razorpay_order_id: Joi.string().trim().min(8).max(64).required(),
  razorpay_payment_id: Joi.string().trim().min(8).max(64).required(),
  razorpay_signature: Joi.string().trim().length(64).hex().required().messages({
    "string.length": "Payment receipt is malformed",
    "string.hex": "Payment receipt is malformed",
  }),
});

/** @deprecated Superseded by {@link verifyCheckoutReceiptSchema}. */
export const verifyPaymentClientSchema = Joi.object({
  orderRef: objectIdOrPublicOrderSchema.optional(),
  orderId: objectIdOrPublicOrderSchema.optional(),
  merchantOrderId: Joi.string().trim().required(),
  transactionId: Joi.string().trim().optional(),
}).or("orderRef", "orderId");

export const refundSchema = Joi.object({
    merchantOrderId: Joi.string().trim().required(),
    amount: Joi.number().min(0.01).required(),
    reason: Joi.string().trim().optional(),
});

export function validateSchema(schema, payload) {
  const { error, value } = schema.validate(payload, {
    abortEarly: false,
    stripUnknown: true,
  });

  if (error) {
    const err = new Error(error.details.map((item) => item.message).join("; "));
    err.statusCode = 400;
    throw err;
  }
  return value;
}
