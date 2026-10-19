export const topicMapLink = (studentId: string, topicId: string) =>
  "/students/" + studentId + "?tab=map&topic=" + encodeURIComponent(topicId);
