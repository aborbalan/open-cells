/**
 * Fixed data for the end-to-end suite, shaped like the TheMealDB responses the app consumes.
 *
 * The application talks to a free public API. Pointing the tests at it would make them depend
 * on a third party being up, on it not rate-limiting, and on its catalogue never changing —
 * a red suite nobody caused. Everything here is served by `mockRecipesApi`.
 */

export const CATEGORIES = [
  {
    idCategory: '1',
    strCategory: 'Beef',
    strCategoryThumb: 'https://www.themealdb.com/images/category/beef.png',
    strCategoryDescription: 'Beef is the culinary name for meat from cattle.',
  },
  {
    idCategory: '2',
    strCategory: 'Dessert',
    strCategoryThumb: 'https://www.themealdb.com/images/category/dessert.png',
    strCategoryDescription: 'Dessert is a course that concludes a meal.',
  },
  {
    idCategory: '3',
    strCategory: 'Seafood',
    strCategoryThumb: 'https://www.themealdb.com/images/category/seafood.png',
    strCategoryDescription: 'Seafood is any form of sea life regarded as food by humans.',
  },
];

/** The daily special on the home page. */
export const RANDOM_MEAL = {
  idMeal: '52771',
  strMeal: 'Spicy Arrabiata Penne',
  strCategory: 'Beef',
  strArea: 'Italian',
  strMealThumb: 'https://www.themealdb.com/images/media/meals/arrabiata.jpg',
  strInstructions: 'Bring a large pot of water to a boil.\nAdd the penne and cook until al dente.',
  strIngredient1: 'Penne rigate',
  strMeasure1: '1 pound',
  strIngredient2: 'Olive oil',
  strMeasure2: '1/4 cup',
  strIngredient3: 'Garlic',
  strMeasure3: '3 cloves',
  strYoutube: 'https://www.youtube.com/watch?v=1IszT_guI08',
};

/** A second full recipe, so navigating between two recipes can be told apart. */
export const SEAFOOD_MEAL = {
  idMeal: '52959',
  strMeal: 'Baked salmon with fennel & tomatoes',
  strCategory: 'Seafood',
  strArea: 'British',
  strMealThumb: 'https://www.themealdb.com/images/media/meals/salmon.jpg',
  strInstructions: 'Heat oven to 180C.\nToss the fennel with the tomatoes and roast.',
  strIngredient1: 'Fennel',
  strMeasure1: '2 heads',
  strIngredient2: 'Salmon',
  strMeasure2: '2 fillets',
  strYoutube: 'https://www.youtube.com/watch?v=cLpvIsWlnKQ',
};

/** What `filter.php?c=<category>` returns: the summary shape, not the full recipe. */
export const MEALS_BY_CATEGORY: Record<string, Array<Record<string, string>>> = {
  Beef: [
    {
      idMeal: RANDOM_MEAL.idMeal,
      strMeal: RANDOM_MEAL.strMeal,
      strMealThumb: RANDOM_MEAL.strMealThumb,
    },
    {
      idMeal: '52874',
      strMeal: 'Beef and Mustard Pie',
      strMealThumb: 'https://www.themealdb.com/images/media/meals/beef-pie.jpg',
    },
  ],
  Dessert: [
    {
      idMeal: '52893',
      strMeal: 'Apple Frangipan Tart',
      strMealThumb: 'https://www.themealdb.com/images/media/meals/tart.jpg',
    },
  ],
  Seafood: [
    {
      idMeal: SEAFOOD_MEAL.idMeal,
      strMeal: SEAFOOD_MEAL.strMeal,
      strMealThumb: SEAFOOD_MEAL.strMealThumb,
    },
  ],
};

/** Full recipes, keyed by the id `lookup.php?i=<id>` is called with. */
export const MEAL_DETAILS: Record<string, Record<string, string>> = {
  [RANDOM_MEAL.idMeal]: RANDOM_MEAL,
  [SEAFOOD_MEAL.idMeal]: SEAFOOD_MEAL,
  '52874': {
    idMeal: '52874',
    strMeal: 'Beef and Mustard Pie',
    strCategory: 'Beef',
    strArea: 'British',
    strMealThumb: 'https://www.themealdb.com/images/media/meals/beef-pie.jpg',
    strInstructions: 'Preheat the oven to 150C.\nToss the beef and flour together.',
    strIngredient1: 'Beef',
    strMeasure1: '1kg',
    strYoutube: '',
  },
  '52893': {
    idMeal: '52893',
    strMeal: 'Apple Frangipan Tart',
    strCategory: 'Dessert',
    strArea: 'British',
    strMealThumb: 'https://www.themealdb.com/images/media/meals/tart.jpg',
    strInstructions: 'Preheat the oven to 200C.\nRoll out the pastry.',
    strIngredient1: 'Apples',
    strMeasure1: '4',
    strYoutube: '',
  },
};
